/**
 * Adaptive Quiz Engine — End-to-End Test
 * Simulates a full student quiz session via the AI engine HTTP API.
 */
const axios = require('axios');
const { Client } = require('pg');

const BASE = 'http://localhost:8000/api/ai/quiz';

async function run() {
  // ── Resolve a real topic_id ──────────────────────────────────────────────────
  const pg = new Client({ connectionString: 'postgres://user:password@localhost:5432/mindtwin_db' });
  await pg.connect();
  const res = await pg.query(
    "SELECT DISTINCT ON (topic_name) id, topic_name FROM topics " +
    "WHERE topic_name='Matrices' AND board='CBSE' ORDER BY topic_name, id LIMIT 1"
  );
  const topic_id  = res.rows[0].id;
  const student_id = '11111111-1111-1111-1111-111111111111';
  console.log(`Topic: ${res.rows[0].topic_name}  ID: ${topic_id}\n`);

  // ── 1. Start quiz ────────────────────────────────────────────────────────────
  const startRes = await axios.post(`${BASE}/start`, { student_id, topic_id, mode: 'adaptive' });
  const { session_id, first_question, theta_start } = startRes.data;
  console.log(`START  session=${session_id.slice(0,8)}...  theta_start=${theta_start}`);
  console.log(`  Q1: ${first_question.question_text.slice(0,60)}...`);

  // ── 2. Answer loop — simulate 8 answers ──────────────────────────────────────
  const answers   = ['B','B','A','C','B','B','A','A']; // mix correct/wrong
  let current_q   = first_question;
  let terminated  = false;
  let final_result = null;

  for (let i = 0; i < answers.length && !terminated; i++) {
    const ans = await axios.post(`${BASE}/answer`, {
      session_id,
      student_id,
      question_id:     current_q.id,
      selected_option: answers[i],
      time_taken_sec:  20 + i * 3,
    });
    const d = ans.data;
    console.log(
      `  Q${i+1}: correct=${d.is_correct}  theta=${d.theta_updated}` +
      `  SE=${d.se}  terminated=${d.terminated}`
    );
    if (d.terminated) {
      terminated   = true;
      final_result = d.final_result;
    } else {
      current_q = d.next_question;
    }
  }

  console.log();

  // ── 3. Validate final result ─────────────────────────────────────────────────
  if (!final_result) throw new Error('Quiz did not terminate within 8 answers');

  console.log('FINAL RESULT:');
  console.log(`  score_percent   = ${final_result.score_percent}`);
  console.log(`  final_theta     = ${final_result.final_theta}`);
  console.log(`  performance     = ${final_result.performance_label}`);
  console.log(`  gap.severity    = ${final_result.gap_analysis.severity}`);
  console.log(`  gap.confidence  = ${final_result.gap_analysis.confidence}`);
  console.log(`  revision_hours  = ${final_result.gap_analysis.revision_hours_needed}`);
  console.log(`  prereq_gaps     = ${final_result.prerequisite_gaps.length}`);
  console.log(`  next_topic      = ${JSON.stringify(final_result.next_suggested_topic)}`);
  console.log(`  recommendations = ${final_result.recommendations.length} items`);

  // Assertions
  console.assert(typeof final_result.final_theta === 'number', 'theta should be number');
  console.assert(final_result.score_percent >= 0 && final_result.score_percent <= 100, 'score 0-100');
  console.assert(['none','minor','significant'].includes(final_result.gap_analysis.severity), 'valid severity');
  console.assert(final_result.performance_label, 'label exists');
  console.assert(Array.isArray(final_result.recommendations), 'recommendations is array');

  // ── 4. Gap report ─────────────────────────────────────────────────────────────
  console.log();
  const grRes = await axios.get(`${BASE}/gap-report/${student_id}`);
  const gr = grRes.data;
  console.log('GAP REPORT:');
  console.log(`  overall_mastery      = ${gr.overall_mastery_percent}%`);
  console.log(`  topics_assessed      = ${gr.topics_assessed}`);
  console.log(`  total_revision_hours = ${gr.total_revision_hours_needed}h`);
  console.log(`  priority_gaps        = ${gr.priority_gaps.length}`);
  console.log(`  subjects             = ${gr.subjects.map(s => s.subject_name).join(', ')}`);

  console.assert(gr.overall_mastery_percent >= 0, 'mastery >= 0');
  console.assert(gr.topics_assessed >= 1, 'at least 1 topic assessed');

  await pg.end();
  console.log('\n✅  All adaptive quiz engine tests PASSED');
}

run().catch(err => {
  console.error('\n❌  FAIL:', err.response?.data || err.message);
  process.exit(1);
});
