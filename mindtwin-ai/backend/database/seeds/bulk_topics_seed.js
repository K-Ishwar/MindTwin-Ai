/**
 * Bulk Topics Seeder — Phase 9.1
 *
 * Reads all knowledge graph JSON files from ai-engine/data/knowledge_graphs/
 * and upserts every topic into the `topics` table.
 *
 * Topic IDs from the knowledge graph are stored as a deterministic UUID v5
 * derived from the graph node ID string, so re-running is always idempotent.
 *
 * Usage:
 *   node backend/database/seeds/bulk_topics_seed.js
 *
 * Env vars (optional — falls back to defaults):
 *   DATABASE_URL   postgres connection string
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.example') });

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/mindtwin_db';

const GRAPHS_DIR = path.resolve(
  __dirname,
  '../../../ai-engine/data/knowledge_graphs'
);

// ── UUID v5 helper (deterministic from string, no external dep) ───────────────
// Namespace: DNS OID (standard)
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function uuidV5(name) {
  const nsBytes = UUID_NAMESPACE.replace(/-/g, '').match(/.{2}/g).map(h => parseInt(h, 16));
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = crypto.createHash('sha1')
    .update(Buffer.from(nsBytes))
    .update(nameBytes)
    .digest();

  // Set version (5) and variant bits
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ── Grade normalisation ───────────────────────────────────────────────────────

function normaliseGrade(grade) {
  // "Class 12" → "12", "Main" → "Main", "UG" → "UG"
  const m = grade.match(/\d+/);
  return m ? m[0] : grade;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('🌱 MindTwin Bulk Topics Seeder');
  console.log(`   DB:     ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`   Graphs: ${GRAPHS_DIR}\n`);

  // Discover all JSON files
  let files;
  try {
    files = fs.readdirSync(GRAPHS_DIR).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error(`❌ Cannot read graphs directory: ${err.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn('⚠  No JSON files found in graphs directory.');
    process.exit(0);
  }

  console.log(`Found ${files.length} knowledge graph file(s):\n`);
  files.forEach(f => console.log(`  • ${f}`));
  console.log('');

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;

  const client = await pool.connect();

  try {
    for (const file of files) {
      const filePath = path.join(GRAPHS_DIR, file);
      let graph;

      try {
        graph = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (parseErr) {
        console.error(`  ❌ ${file}: JSON parse error — ${parseErr.message}`);
        totalErrors++;
        continue;
      }

      const { subject, board, grade, topics = [] } = graph;
      const gradeLevel = normaliseGrade(grade || '');

      console.log(`📚 ${file}`);
      console.log(`   ${subject} | ${board} | ${grade} | ${topics.length} topics`);

      let fileInserted = 0;
      let fileSkipped  = 0;

      for (const topic of topics) {
        // Derive a deterministic UUID from the graph node ID
        const deterministicId = uuidV5(`mindtwin:topic:${topic.id}`);

        // Build prerequisite_topic_ids as array of deterministic UUIDs
        const prereqIds = (topic.prerequisites || []).map(
          pid => uuidV5(`mindtwin:topic:${pid}`)
        );

        try {
          const result = await client.query(
            `INSERT INTO topics (
               id,
               subject,
               topic_name,
               board,
               grade_level,
               weightage_percent,
               estimated_study_hours,
               difficulty_level,
               prerequisite_topic_ids
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               topic_name            = EXCLUDED.topic_name,
               board                 = EXCLUDED.board,
               grade_level           = EXCLUDED.grade_level,
               weightage_percent     = EXCLUDED.weightage_percent,
               estimated_study_hours = EXCLUDED.estimated_study_hours,
               difficulty_level      = EXCLUDED.difficulty_level,
               prerequisite_topic_ids= EXCLUDED.prerequisite_topic_ids
             RETURNING (xmax = 0) AS inserted`,
            [
              deterministicId,
              subject,
              topic.name,
              board,
              gradeLevel,
              parseFloat(topic.weightage_percent) || 5.0,
              parseFloat(topic.estimated_hours)   || 2.0,
              parseInt(topic.difficulty_level, 10) || 3,
              JSON.stringify(prereqIds),
            ]
          );

          if (result.rows[0]?.inserted) {
            fileInserted++;
          } else {
            fileSkipped++;
          }
        } catch (dbErr) {
          console.error(`     ⚠  Topic "${topic.name}" (${deterministicId}): ${dbErr.message}`);
          totalErrors++;
        }
      }

      console.log(`   ✅ Inserted: ${fileInserted}  |  Updated/skipped: ${fileSkipped}\n`);
      totalInserted += fileInserted;
      totalSkipped  += fileSkipped;
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log('─'.repeat(50));
  console.log(`✅ Seed complete`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Updated  : ${totalSkipped}`);
  console.log(`   Errors   : ${totalErrors}`);
  console.log('─'.repeat(50));

  if (totalErrors > 0) process.exit(1);
}

seed().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
