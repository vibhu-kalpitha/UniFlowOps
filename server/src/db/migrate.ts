import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, ensureDbConnected } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Cannot run migrations: MySQL connection failed');
    return { applied: [], skipped: [] };
  }

  // 1. Ensure schema_migrations version tracking table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const appliedRows = await db.query<{ version: string }>(`SELECT version FROM schema_migrations`);
  const appliedSet = new Set(appliedRows.map(r => r.version));

  const migrationsDir = path.resolve(__dirname, './migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`⚠️ Migrations directory not found: ${migrationsDir}`);
    return { applied: [], skipped: [] };
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    console.log(`📦 Applying MySQL Migration: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    await db.transaction(async (tx) => {
      await tx.exec(sql);
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
      await tx.execute(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [file, now]);
    });

    applied.push(file);
    console.log(`✅ Applied MySQL Migration: ${file}`);
  }

  console.log(`🎉 Migrations summary: ${applied.length} applied, ${skipped.length} already up-to-date.`);
  return { applied, skipped };
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  ensureDbConnected().then(() => runMigrations()).then(() => process.exit(0)).catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}
