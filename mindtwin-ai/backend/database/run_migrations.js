const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEED_FILE = path.join(__dirname, 'seed.sql');

async function runMigrations() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/mindtwin_db'
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL database.');

        // Create migrations_log table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations_log (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Get all migration files
        const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

        for (const file of files) {
            // Check if already applied
            const res = await client.query('SELECT 1 FROM migrations_log WHERE migration_name = $1', [file]);
            
            if (res.rowCount > 0) {
                console.log(`Skipping ${file} - already applied.`);
                continue;
            }

            console.log(`Applying ${file}...`);
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            
            // Execute the migration within a transaction
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO migrations_log (migration_name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`Successfully applied ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw new Error(`Error applying ${file}: ${error.message}`);
            }
        }

        console.log('All migrations applied successfully.');

        // Run seed file
        if (fs.existsSync(SEED_FILE)) {
            console.log('Running seed.sql...');
            const seedSql = fs.readFileSync(SEED_FILE, 'utf8');
            await client.query(seedSql);
            console.log('Seeding completed successfully.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigrations();
