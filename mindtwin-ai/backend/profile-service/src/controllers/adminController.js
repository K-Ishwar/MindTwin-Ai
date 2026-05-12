/**
 * Admin Controller — profile-service
 * All routes require a valid admin JWT ({ admin_id, role: 'admin' }).
 */
const db = require('../config/db');

// ── GET /api/profile/admin/stats ──────────────────────────────────────────────

exports.getPlatformStats = async (req, res, next) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalStudentsRes,
      activeStudentsRes,
      totalGuardiansRes,
      totalSessionsRes,
      totalQuizzesRes,
      avgStressRes,
      popularSubjectsRes,
      dailyActiveRes,
      dailySessionsRes,
      gradeDistRes,
    ] = await Promise.all([
      // Total students
      db.query('SELECT COUNT(*) AS total FROM students'),

      // Active students this week (≥1 completed session)
      db.query(
        `SELECT COUNT(DISTINCT student_id) AS total
         FROM study_sessions
         WHERE completed = TRUE AND started_at >= $1`,
        [weekAgo]
      ),

      // Total guardians
      db.query('SELECT COUNT(*) AS total FROM guardian_accounts'),

      // Total sessions completed all time
      db.query('SELECT COUNT(*) AS total FROM study_sessions WHERE completed = TRUE'),

      // Total quizzes taken
      db.query('SELECT COUNT(*) AS total FROM quiz_attempts'),

      // Platform-wide avg stress last 7 days
      db.query(
        `SELECT ROUND(AVG(stress_score)::numeric, 3) AS avg_score
         FROM stress_logs WHERE logged_at >= $1`,
        [weekAgo]
      ),

      // Most popular subjects (by completed session count)
      db.query(
        `SELECT t.subject, COUNT(*) AS session_count
         FROM study_sessions ss
         JOIN topics t ON t.id = ss.topic_id
         WHERE ss.completed = TRUE
         GROUP BY t.subject
         ORDER BY session_count DESC
         LIMIT 6`
      ),

      // Daily active users last 14 days
      db.query(
        `SELECT DATE(started_at) AS day, COUNT(DISTINCT student_id) AS active_users
         FROM study_sessions
         WHERE started_at >= $1
         GROUP BY day
         ORDER BY day ASC`,
        [twoWeeksAgo]
      ),

      // Sessions completed per day last 14 days
      db.query(
        `SELECT DATE(started_at) AS day, COUNT(*) AS sessions
         FROM study_sessions
         WHERE completed = TRUE AND started_at >= $1
         GROUP BY day
         ORDER BY day ASC`,
        [twoWeeksAgo]
      ),

      // Student distribution by grade level
      db.query(
        `SELECT grade_level, COUNT(*) AS count
         FROM students
         WHERE grade_level IS NOT NULL
         GROUP BY grade_level
         ORDER BY grade_level`
      ),
    ]);

    res.json({
      success: true,
      stats: {
        total_students:    parseInt(totalStudentsRes.rows[0].total),
        active_students:   parseInt(activeStudentsRes.rows[0].total),
        total_guardians:   parseInt(totalGuardiansRes.rows[0].total),
        total_sessions:    parseInt(totalSessionsRes.rows[0].total),
        total_quizzes:     parseInt(totalQuizzesRes.rows[0].total),
        avg_stress_7d:     parseFloat(avgStressRes.rows[0].avg_score) || 0,
        popular_subjects:  popularSubjectsRes.rows.map((r) => ({
          subject: r.subject,
          count: parseInt(r.session_count),
        })),
        daily_active_users: dailyActiveRes.rows.map((r) => ({
          day: r.day,
          count: parseInt(r.active_users),
        })),
        daily_sessions: dailySessionsRes.rows.map((r) => ({
          day: r.day,
          count: parseInt(r.sessions),
        })),
        grade_distribution: gradeDistRes.rows.map((r) => ({
          grade: r.grade_level,
          count: parseInt(r.count),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/profile/admin/students ──────────────────────────────────────────

exports.getStudents = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sortBy = ['name', 'email', 'grade_level', 'created_at'].includes(req.query.sort)
      ? req.query.sort : 'created_at';
    const order  = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const whereClause = search
      ? `WHERE (s.name ILIKE $3 OR s.email ILIKE $3)`
      : '';
    const params = search
      ? [limit, offset, search]
      : [limit, offset];

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM students s ${whereClause}`,
      search ? [search] : []
    );
    const total = parseInt(countRes.rows[0].total);

    const studentsRes = await db.query(
      `SELECT
         s.id, s.name, s.email, s.grade_level, s.board,
         s.onboarding_completed, s.created_at,
         MAX(ss.started_at) AS last_active,
         COUNT(ss.id) FILTER (WHERE ss.completed = TRUE AND ss.started_at >= '${weekAgo}') AS sessions_this_week,
         sl.stress_score AS latest_stress,
         sl.severity     AS stress_severity
       FROM students s
       LEFT JOIN study_sessions ss ON ss.student_id = s.id
       LEFT JOIN LATERAL (
         SELECT stress_score, severity FROM stress_logs
         WHERE student_id = s.id ORDER BY logged_at DESC LIMIT 1
       ) sl ON TRUE
       ${whereClause}
       GROUP BY s.id, sl.stress_score, sl.severity
       ORDER BY ${sortBy} ${order}
       LIMIT $1 OFFSET $2`,
      params
    );

    res.json({
      success: true,
      students: studentsRes.rows.map((s) => ({
        id:                   s.id,
        name:                 s.name,
        email:                s.email,
        grade_level:          s.grade_level,
        board:                s.board,
        onboarding_completed: s.onboarding_completed,
        created_at:           s.created_at,
        last_active:          s.last_active,
        sessions_this_week:   parseInt(s.sessions_this_week) || 0,
        latest_stress:        s.latest_stress ? parseFloat(s.latest_stress) : null,
        stress_severity:      s.stress_severity || null,
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/profile/admin/guardians ─────────────────────────────────────────

exports.getGuardians = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await db.query('SELECT COUNT(*) AS total FROM guardian_accounts');
    const total = parseInt(countRes.rows[0].total);

    const guardiansRes = await db.query(
      `SELECT
         g.id, g.name, g.email, g.role, g.institution_name, g.created_at,
         COUNT(sgl.id) FILTER (WHERE sgl.link_status = 'approved') AS linked_students
       FROM guardian_accounts g
       LEFT JOIN student_guardian_links sgl ON sgl.guardian_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      guardians: guardiansRes.rows.map((g) => ({
        id:               g.id,
        name:             g.name,
        email:            g.email,
        role:             g.role,
        institution_name: g.institution_name,
        created_at:       g.created_at,
        linked_students:  parseInt(g.linked_students) || 0,
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/profile/admin/student/:id ───────────────────────────────────────

exports.getStudentDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [studentRes, sessionsRes, quizzesRes, stressRes, guardiansRes] = await Promise.all([
      db.query(
        `SELECT id, name, email, grade_level, board, onboarding_completed, created_at
         FROM students WHERE id = $1`,
        [id]
      ),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE completed = TRUE) AS completed,
                COUNT(*) FILTER (WHERE skipped = TRUE)   AS skipped,
                ROUND(AVG(actual_duration_min)::numeric, 1) AS avg_duration
         FROM study_sessions WHERE student_id = $1`,
        [id]
      ),
      db.query(
        `SELECT COUNT(*) AS total,
                ROUND(AVG(score_percent)::numeric, 1) AS avg_score,
                COUNT(*) FILTER (WHERE gap_detected) AS gaps
         FROM quiz_attempts WHERE student_id = $1`,
        [id]
      ),
      db.query(
        `SELECT stress_score, severity, logged_at
         FROM stress_logs WHERE student_id = $1
         ORDER BY logged_at DESC LIMIT 10`,
        [id]
      ),
      db.query(
        `SELECT g.name, g.email, g.role, sgl.link_status
         FROM student_guardian_links sgl
         JOIN guardian_accounts g ON g.id = sgl.guardian_id
         WHERE sgl.student_id = $1`,
        [id]
      ),
    ]);

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({
      success: true,
      student:  studentRes.rows[0],
      sessions: sessionsRes.rows[0],
      quizzes:  quizzesRes.rows[0],
      stress_history: stressRes.rows,
      guardians: guardiansRes.rows,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/profile/admin/notification-history ───────────────────────────────

exports.getNotificationHistory = async (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 100);

    const [studentNotifs, guardianNotifs] = await Promise.all([
      db.query(
        `SELECT n.id, 'student' AS recipient_type, s.name AS recipient_name,
                n.type, n.title, n.body, n.read, n.created_at
         FROM notifications n
         JOIN students s ON s.id = n.student_id
         ORDER BY n.created_at DESC LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT n.id, 'guardian' AS recipient_type, g.name AS recipient_name,
                n.type, n.title, n.body, n.read, n.created_at
         FROM guardian_notifications n
         JOIN guardian_accounts g ON g.id = n.guardian_id
         ORDER BY n.created_at DESC LIMIT $1`,
        [limit]
      ),
    ]);

    // Merge and sort by created_at desc
    const all = [...studentNotifs.rows, ...guardianNotifs.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    res.json({ success: true, notifications: all });
  } catch (err) {
    next(err);
  }
};
