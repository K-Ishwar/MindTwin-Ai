const db = require('../config/db');

// ─── Helper: validate guardian → student access ───────────────────────────────

/**
 * Verifies that guardian_id has an approved link to student_id.
 * Logs the access action to guardian_access_logs.
 * Throws a 403 error object if the link does not exist or is not approved.
 */
async function validateGuardianAccess(guardian_id, student_id, action = 'view') {
  const linkResult = await db.query(
    `SELECT id FROM student_guardian_links
     WHERE guardian_id = $1 AND student_id = $2 AND link_status = 'approved'`,
    [guardian_id, student_id]
  );

  if (linkResult.rows.length === 0) {
    const err = new Error('Access denied: no approved link to this student');
    err.status = 403;
    throw err;
  }

  // Audit-log asynchronously — do not await to keep response fast
  db.query(
    `INSERT INTO guardian_access_logs (guardian_id, student_id, action) VALUES ($1, $2, $3)`,
    [guardian_id, student_id, action]
  ).catch((e) => console.error('[guardian_access_logs] insert error:', e.message));
}

// ─── Shared date helpers ──────────────────────────────────────────────────────

/**
 * Returns the ISO timestamp for Sunday 00:00 of the current week,
 * offset by `weeksBack` weeks into the past (default 0 = this week).
 */
function startOfWeek(weeksBack = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() - weeksBack * 7); // Sunday
  return d.toISOString();
}

/**
 * Returns the ISO timestamp for the end of a week that starts at `weekStartISO`.
 */
function endOfWeek(weekStartISO) {
  const d = new Date(weekStartISO);
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function dateFromPeriod(period) {
  const now = new Date();
  if (period === 'week') {
    now.setDate(now.getDate() - 7);
  } else if (period === 'month') {
    now.setMonth(now.getMonth() - 1);
  } else {
    return null; // all_time — no filter
  }
  return now.toISOString();
}

// ─── 1. GET /api/profile/guardian/student/:studentId/overview ─────────────────

const getStudentOverview = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { studentId } = req.params;

  try {
    await validateGuardianAccess(guardian_id, studentId, 'view_overview');

    // Basic student info
    const studentRes = await db.query(
      `SELECT name, grade_level, board, created_at FROM students WHERE id = $1`,
      [studentId]
    );
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    const student = studentRes.rows[0];

    const weekStart = startOfWeek();

    // Current week session stats
    const weekSessionRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE completed = true)              AS sessions_completed,
         COUNT(*)                                              AS sessions_planned,
         ROUND(
           COUNT(*) FILTER (WHERE completed = true) * 100.0
           / NULLIF(COUNT(*), 0), 2
         )                                                     AS completion_rate,
         ROUND(AVG(mood_after)::numeric, 2)                   AS avg_mood,
         ROUND(SUM(actual_duration_min) / 60.0, 2)            AS total_study_hours
       FROM study_sessions
       WHERE student_id = $1 AND session_date >= $2`,
      [studentId, weekStart]
    );
    const weekSessions = weekSessionRes.rows[0];

    // Quizzes this week
    const weekQuizRes = await db.query(
      `SELECT COUNT(*) AS quizzes_taken
       FROM quiz_attempts
       WHERE student_id = $1 AND completed_at >= $2`,
      [studentId, weekStart]
    );

    // Stress status (latest log)
    const stressRes = await db.query(
      `SELECT stress_score, severity, logged_at
       FROM stress_logs
       WHERE student_id = $1
       ORDER BY logged_at DESC LIMIT 5`,
      [studentId]
    );
    let stress_status = null;
    if (stressRes.rows.length > 0) {
      const latest = stressRes.rows[0];
      const oldest = stressRes.rows[stressRes.rows.length - 1];
      let trend = 'stable';
      if (stressRes.rows.length >= 2) {
        const delta = latest.stress_score - oldest.stress_score;
        trend = delta > 0.5 ? 'worsening' : delta < -0.5 ? 'improving' : 'stable';
      }
      stress_status = {
        current_score: latest.stress_score,
        severity: latest.severity,
        trend
        // NOTE: behavioral_snapshot is intentionally excluded for privacy
      };
    }

    // Upcoming exams (next 60 days)
    const examsRes = await db.query(
      `SELECT subject, exam_date,
              (exam_date::date - CURRENT_DATE) AS days_away
       FROM exams
       WHERE student_id = $1 AND exam_date >= CURRENT_DATE
       ORDER BY exam_date ASC LIMIT 5`,
      [studentId]
    );

    // Streak: consecutive days with at least one completed session
    const streakRes = await db.query(
      `WITH daily AS (
         SELECT DISTINCT session_date
         FROM study_sessions
         WHERE student_id = $1 AND completed = true
         ORDER BY session_date DESC
       ),
       numbered AS (
         SELECT session_date,
                ROW_NUMBER() OVER (ORDER BY session_date DESC) AS rn
         FROM daily
       ),
       streaks AS (
         SELECT session_date,
                session_date - (rn || ' days')::interval AS grp
         FROM numbered
       )
       SELECT
         MAX(cnt) FILTER (WHERE is_current) AS current_streak,
         MAX(cnt)                           AS longest_streak
       FROM (
         SELECT grp,
                COUNT(*) AS cnt,
                MAX(session_date) = MAX(MAX(session_date)) OVER () AS is_current
         FROM streaks
         GROUP BY grp
       ) t`,
      [studentId]
    );
    const streak = streakRes.rows[0] || { current_streak: 0, longest_streak: 0 };

    // Focus token balance
    const tokenRes = await db.query(
      `SELECT balance FROM focus_tokens WHERE student_id = $1`,
      [studentId]
    );

    // Last active (last ended study session)
    const lastActiveRes = await db.query(
      `SELECT MAX(ended_at) AS last_active FROM study_sessions WHERE student_id = $1`,
      [studentId]
    );

    res.json({
      success: true,
      student: {
        name: student.name,
        grade_level: student.grade_level,
        board: student.board
      },
      current_week: {
        sessions_completed: parseInt(weekSessions.sessions_completed) || 0,
        sessions_planned:   parseInt(weekSessions.sessions_planned)   || 0,
        completion_rate:    parseFloat(weekSessions.completion_rate)  || 0,
        avg_mood:           parseFloat(weekSessions.avg_mood)         || null,
        total_study_hours:  parseFloat(weekSessions.total_study_hours) || 0,
        quizzes_taken:      parseInt(weekQuizRes.rows[0]?.quizzes_taken) || 0
      },
      stress_status,
      upcoming_exams: examsRes.rows.map((e) => ({
        subject:   e.subject,
        exam_date: e.exam_date,
        days_away: parseInt(e.days_away)
      })),
      streak: {
        current_streak: parseInt(streak.current_streak) || 0,
        longest_streak: parseInt(streak.longest_streak) || 0
      },
      token_balance: tokenRes.rows[0]?.balance ?? 0,
      last_active:   lastActiveRes.rows[0]?.last_active ?? null
    });
  } catch (err) {
    next(err);
  }
};

// ─── 2. GET /api/profile/guardian/student/:studentId/performance ──────────────

const getPerformanceReport = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { studentId } = req.params;
  const period = req.query.period || 'month'; // week | month | all_time

  try {
    await validateGuardianAccess(guardian_id, studentId, `view_performance_${period}`);

    const since = dateFromPeriod(period);
    const dateFilter = since ? `AND qa.completed_at >= '${since}'` : '';
    const sessionDateFilter = since ? `AND ss.session_date >= '${since}'` : '';

    // Per-subject stats
    const subjectsRes = await db.query(
      `SELECT
         t.subject,
         COUNT(DISTINCT t.id)                                           AS topics_covered,
         ROUND(AVG(qa.score_percent)::numeric, 2)                       AS avg_quiz_score,
         COUNT(DISTINCT CASE WHEN qa.gap_detected THEN qa.id END)       AS gap_count
       FROM topics t
       LEFT JOIN quiz_attempts qa ON qa.topic_id = t.id
         AND qa.student_id = $1 ${dateFilter}
       LEFT JOIN study_sessions ss ON ss.topic_id = t.id
         AND ss.student_id = $1 AND ss.completed = true ${sessionDateFilter}
       GROUP BY t.subject
       ORDER BY t.subject`,
      [studentId]
    );

    // Theta trend per subject — last 30 data points
    const thetaRes = await db.query(
      `SELECT t.subject, qa.completed_at AS date, qa.theta_estimate AS theta
       FROM quiz_attempts qa
       JOIN topics t ON t.id = qa.topic_id
       WHERE qa.student_id = $1 ${dateFilter.replace(/qa\./g, 'qa.')}
       ORDER BY qa.completed_at ASC`,
      [studentId]
    );

    // Group theta by subject (last 30 per subject)
    const thetaBySubject = {};
    for (const row of thetaRes.rows) {
      if (!thetaBySubject[row.subject]) thetaBySubject[row.subject] = [];
      thetaBySubject[row.subject].push({ date: row.date, theta: row.theta });
    }
    for (const subj of Object.keys(thetaBySubject)) {
      thetaBySubject[subj] = thetaBySubject[subj].slice(-30);
    }

    // Study consistency: days with ≥1 completed session / total days in period
    const daysInPeriod = period === 'week' ? 7 : period === 'month' ? 30 : null;
    let study_consistency_percent = null;
    if (daysInPeriod) {
      const consistencyRes = await db.query(
        `SELECT COUNT(DISTINCT session_date) AS active_days
         FROM study_sessions
         WHERE student_id = $1 AND completed = true ${sessionDateFilter.replace('ss.', '')}`,
        [studentId]
      );
      const activeDays = parseInt(consistencyRes.rows[0]?.active_days) || 0;
      study_consistency_percent = parseFloat(((activeDays / daysInPeriod) * 100).toFixed(2));
    }

    // Determine strongest / weakest
    const scored = subjectsRes.rows.filter((s) => s.avg_quiz_score !== null);
    const sorted = [...scored].sort((a, b) => b.avg_quiz_score - a.avg_quiz_score);
    const strongest_subject = sorted[0]?.subject || null;
    const weakest_subject = sorted[sorted.length - 1]?.subject || null;

    // Overall trend — compare first-half avg theta vs second-half avg theta
    const allTheta = thetaRes.rows.map((r) => r.theta);
    let overall_trend = 'stable';
    if (allTheta.length >= 4) {
      const mid = Math.floor(allTheta.length / 2);
      const firstHalf = allTheta.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondHalf = allTheta.slice(mid).reduce((a, b) => a + b, 0) / (allTheta.length - mid);
      const delta = secondHalf - firstHalf;
      overall_trend = delta > 0.1 ? 'improving' : delta < -0.1 ? 'declining' : 'stable';
    }

    const subjects = subjectsRes.rows.map((s) => {
      const trend = thetaBySubject[s.subject] || [];
      // Compute improvement_percent from first → last theta in trend
      let improvement_percent = 0;
      if (trend.length >= 2) {
        const first = trend[0].theta;
        const last = trend[trend.length - 1].theta;
        improvement_percent = first !== 0
          ? parseFloat((((last - first) / Math.abs(first)) * 100).toFixed(2))
          : 0;
      }
      return {
        subject_name:        s.subject,
        topics_covered:      parseInt(s.topics_covered) || 0,
        avg_quiz_score:      parseFloat(s.avg_quiz_score) || 0,
        theta_trend:         trend,
        gap_count:           parseInt(s.gap_count) || 0,
        improvement_percent
      };
    });

    res.json({
      success: true,
      period,
      subjects,
      overall_trend,
      strongest_subject,
      weakest_subject,
      study_consistency_percent
    });
  } catch (err) {
    next(err);
  }
};

// ─── 3. GET /api/profile/guardian/student/:studentId/weekly-summary ───────────

const getWeeklySummary = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { studentId } = req.params;
  // week_offset=0 → current week, week_offset=1 → last week, etc.
  const weeksBack = Math.max(0, parseInt(req.query.week_offset) || 0);

  try {
    await validateGuardianAccess(guardian_id, studentId, 'view_weekly_summary');

    const weekStart = startOfWeek(weeksBack);
    const weekEnd   = endOfWeek(weekStart);

    // Sessions
    const sessionRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE completed = true AND skipped = false)  AS sessions_done,
         COUNT(*) FILTER (WHERE skipped = true OR completed = false)   AS sessions_missed,
         ROUND(AVG(mood_after)::numeric, 2)                            AS avg_mood
       FROM study_sessions
       WHERE student_id = $1 AND session_date >= $2 AND session_date < $3`,
      [studentId, weekStart, weekEnd]
    );
    const sessions = sessionRes.rows[0];

    // Topics mastered that week (completed sessions with distinct topics)
    const topicsRes = await db.query(
      `SELECT DISTINCT t.topic_name
       FROM study_sessions ss
       JOIN topics t ON t.id = ss.topic_id
       WHERE ss.student_id = $1 AND ss.session_date >= $2 AND ss.session_date < $3
         AND ss.completed = true`,
      [studentId, weekStart, weekEnd]
    );

    // Quiz stats that week
    const quizRes = await db.query(
      `SELECT COUNT(*) AS quizzes_taken, ROUND(AVG(score_percent)::numeric, 2) AS avg_quiz_score
       FROM quiz_attempts
       WHERE student_id = $1 AND completed_at >= $2 AND completed_at < $3`,
      [studentId, weekStart, weekEnd]
    );
    const quizStats = quizRes.rows[0];

    // Stress level that week (avg stress_score)
    const stressRes = await db.query(
      `SELECT stress_score FROM stress_logs
       WHERE student_id = $1 AND logged_at >= $2 AND logged_at < $3`,
      [studentId, weekStart, weekEnd]
    );
    let stress_level_this_week = 'low';
    if (stressRes.rows.length > 0) {
      const avgScore = stressRes.rows.reduce((a, r) => a + r.stress_score, 0) / stressRes.rows.length;
      stress_level_this_week = avgScore >= 0.7 ? 'high' : avgScore >= 0.4 ? 'moderate' : 'low';
    }

    // Focus tokens earned that week
    const tokenRes = await db.query(
      `SELECT COALESCE(SUM(tokens_delta), 0) AS tokens_earned
       FROM token_history
       WHERE student_id = $1 AND tokens_delta > 0 AND created_at >= $2 AND created_at < $3`,
      [studentId, weekStart, weekEnd]
    );

    // Build highlights & concerns
    const highlights = [];
    const concerns = [];

    const done = parseInt(sessions.sessions_done) || 0;
    const missed = parseInt(sessions.sessions_missed) || 0;
    const quizCount = parseInt(quizStats.quizzes_taken) || 0;
    const avgScore = parseFloat(quizStats.avg_quiz_score) || 0;

    if (done > 0) highlights.push(`Completed ${done} study session${done > 1 ? 's' : ''} this week`);
    if (quizCount > 0 && avgScore > 0) {
      highlights.push(`Took ${quizCount} quiz${quizCount > 1 ? 'zes' : ''} with an average score of ${avgScore}%`);
    }
    if (avgScore >= 80) highlights.push(`Strong quiz performance — averaging ${avgScore}%`);
    if (topicsRes.rows.length > 0) {
      highlights.push(`Covered ${topicsRes.rows.length} topic${topicsRes.rows.length > 1 ? 's' : ''} this week`);
    }

    if (missed >= 3) concerns.push(`Missed ${missed} study sessions this week`);
    if (stress_level_this_week === 'high') concerns.push('Stress levels were elevated this week');
    if (avgScore > 0 && avgScore < 50) concerns.push(`Quiz performance needs attention — averaging ${avgScore}%`);

    res.json({
      success: true,
      week_of:                  weekStart,
      week_end:                 weekEnd,
      week_offset:              weeksBack,
      sessions_done:            done,
      sessions_missed:          missed,
      topics_mastered:          topicsRes.rows.map((r) => r.topic_name),
      quizzes_taken:            quizCount,
      avg_quiz_score:           avgScore,
      stress_level_this_week,
      focus_tokens_earned:      parseInt(tokenRes.rows[0]?.tokens_earned) || 0,
      highlights,
      concerns
    });
  } catch (err) {
    next(err);
  }
};

// ─── 4. GET /api/profile/guardian/student/:studentId/exam-readiness ───────────

const getExamReadiness = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  const { studentId } = req.params;

  try {
    await validateGuardianAccess(guardian_id, studentId, 'view_exam_readiness');

    // Fetch upcoming exams
    const examsRes = await db.query(
      `SELECT id, subject, exam_date, (exam_date::date - CURRENT_DATE) AS days_remaining
       FROM exams
       WHERE student_id = $1 AND exam_date >= CURRENT_DATE
       ORDER BY exam_date ASC`,
      [studentId]
    );

    const readiness = await Promise.all(
      examsRes.rows.map(async (exam) => {
        // All topics for this subject & student's board/grade
        const topicsRes = await db.query(
          `SELECT t.id, t.topic_name, t.weightage_percent
           FROM topics t
           JOIN students s ON s.board = t.board AND s.grade_level = t.grade_level
           WHERE s.id = $1 AND t.subject = $2`,
          [studentId, exam.subject]
        );
        const totalTopics = topicsRes.rows.length;

        if (totalTopics === 0) {
          return {
            subject:                  exam.subject,
            exam_date:                exam.exam_date,
            days_remaining:           parseInt(exam.days_remaining),
            syllabus_coverage_percent: 0,
            avg_topic_mastery:        0,
            gaps_detected:            0,
            readiness_score:          0,
            readiness_label:          'At Risk'
          };
        }

        const topicIds = topicsRes.rows.map((t) => t.id);

        // Coverage: topics with at least one completed session
        const coverageRes = await db.query(
          `SELECT COUNT(DISTINCT topic_id) AS covered
           FROM study_sessions
           WHERE student_id = $1 AND completed = true AND topic_id = ANY($2)`,
          [studentId, topicIds]
        );
        const covered = parseInt(coverageRes.rows[0]?.covered) || 0;
        const syllabus_coverage_percent = parseFloat(((covered / totalTopics) * 100).toFixed(2));

        // Avg mastery (theta) for covered topics
        const masteryRes = await db.query(
          `SELECT ROUND(AVG(theta_estimate)::numeric, 3) AS avg_theta,
                  COUNT(*) FILTER (WHERE gap_detected) AS gaps_detected
           FROM quiz_attempts
           WHERE student_id = $1 AND topic_id = ANY($2)`,
          [studentId, topicIds]
        );
        const avg_theta = parseFloat(masteryRes.rows[0]?.avg_theta) || 0;
        const gaps_detected = parseInt(masteryRes.rows[0]?.gaps_detected) || 0;

        // Normalise theta (-3..+3) → 0..100
        const avg_topic_mastery = parseFloat((((avg_theta + 3) / 6) * 100).toFixed(2));

        // Readiness score: weighted combination
        const days = parseInt(exam.days_remaining);
        const timeBonus = days > 30 ? 10 : days > 14 ? 5 : 0;
        const gapPenalty = Math.min(gaps_detected * 5, 20);
        const readiness_score = Math.min(
          100,
          Math.max(
            0,
            parseFloat(
              (
                syllabus_coverage_percent * 0.4 +
                avg_topic_mastery * 0.5 +
                timeBonus -
                gapPenalty
              ).toFixed(2)
            )
          )
        );

        const readiness_label =
          readiness_score >= 70 ? 'On Track' :
          readiness_score >= 45 ? 'Needs Attention' : 'At Risk';

        return {
          subject:                  exam.subject,
          exam_date:                exam.exam_date,
          days_remaining:           days,
          syllabus_coverage_percent,
          avg_topic_mastery,
          gaps_detected,
          readiness_score,
          readiness_label
        };
      })
    );

    res.json({ success: true, exam_readiness: readiness });
  } catch (err) {
    next(err);
  }
};

// ─── 5. GET /api/profile/guardian/my-students ─────────────────────────────────

const getMyStudentsSummary = async (req, res, next) => {
  const guardian_id = req.user.guardian_id;
  // Pagination: ?page=1&limit=20
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    // Count total approved linked students for pagination metadata
    const countRes = await db.query(
      `SELECT COUNT(*) AS total
       FROM student_guardian_links
       WHERE guardian_id = $1 AND link_status = 'approved'`,
      [guardian_id]
    );
    const total = parseInt(countRes.rows[0].total);

    // Fetch paginated approved linked students
    const linkedRes = await db.query(
      `SELECT s.id, s.name, s.email, s.grade_level, s.board
       FROM student_guardian_links sgl
       JOIN students s ON s.id = sgl.student_id
       WHERE sgl.guardian_id = $1 AND sgl.link_status = 'approved'
       ORDER BY s.name ASC
       LIMIT $2 OFFSET $3`,
      [guardian_id, limit, offset]
    );

    if (linkedRes.rows.length === 0) {
      return res.json({
        success: true,
        students: [],
        pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
      });
    }

    const studentIds = linkedRes.rows.map((s) => s.id);

    // Batch-log access for all students
    const logValues = studentIds.map((_, i) => `($1, $${i + 2}, 'view_my_students_summary')`).join(', ');
    db.query(
      `INSERT INTO guardian_access_logs (guardian_id, student_id, action) VALUES ${logValues}`,
      [guardian_id, ...studentIds]
    ).catch((e) => console.error('[guardian_access_logs] batch insert error:', e.message));

    const weekStart = startOfWeek();

    // Per-student quick stats (single batch query each)
    const summaries = await Promise.all(
      linkedRes.rows.map(async (student) => {
        // Sessions this week
        const sessRes = await db.query(
          `SELECT
             COUNT(*) FILTER (WHERE completed = true) AS done,
             COUNT(*)                                 AS planned
           FROM study_sessions
           WHERE student_id = $1 AND session_date >= $2`,
          [student.id, weekStart]
        );

        // Latest stress
        const stressRes = await db.query(
          `SELECT stress_score, severity FROM stress_logs
           WHERE student_id = $1 ORDER BY logged_at DESC LIMIT 1`,
          [student.id]
        );

        // Token balance
        const tokenRes = await db.query(
          `SELECT balance FROM focus_tokens WHERE student_id = $1`,
          [student.id]
        );

        // Last active
        const lastActiveRes = await db.query(
          `SELECT MAX(ended_at) AS last_active FROM study_sessions WHERE student_id = $1`,
          [student.id]
        );

        const done = parseInt(sessRes.rows[0]?.done) || 0;
        const planned = parseInt(sessRes.rows[0]?.planned) || 0;

        return {
          id:            student.id,
          name:          student.name,
          grade_level:   student.grade_level,
          board:         student.board,
          this_week: {
            sessions_done:    done,
            sessions_planned: planned,
            completion_rate:  planned > 0
              ? parseFloat(((done / planned) * 100).toFixed(2))
              : 0
          },
          latest_stress: stressRes.rows[0]
            ? { score: stressRes.rows[0].stress_score, severity: stressRes.rows[0].severity }
            : null,
          token_balance: tokenRes.rows[0]?.balance ?? 0,
          last_active:   lastActiveRes.rows[0]?.last_active ?? null
        };
      })
    );

    res.json({
      success: true,
      students: summaries,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStudentOverview,
  getPerformanceReport,
  getWeeklySummary,
  getExamReadiness,
  getMyStudentsSummary
};
