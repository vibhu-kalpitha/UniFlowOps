import { db, ensureDbConnected } from './connection.js';
import { runMigrations } from './migrate.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

export async function bootstrapAdmin(): Promise<void> {
  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Database connection failed. Cannot bootstrap admin.');
    process.exit(1);
  }

  // Ensure migrations are applied prior to checking users table
  await runMigrations();

  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin').trim();
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!rawPassword || !rawPassword.trim()) {
    console.warn('⚠️ BOOTSTRAP_ADMIN_PASSWORD is not set or empty in environment. Skipping admin bootstrap.');
    return;
  }

  const cleanPassword = rawPassword.trim();

  // Check if user already exists (idempotency check)
  const existingUser = await db.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE username = ?`,
    [username]
  );

  if (existingUser.length > 0) {
    console.log(`ℹ️ Admin user '${username}' already exists. Bootstrap skipped (idempotent).`);
    return;
  }

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const id = `usr-admin-${Date.now()}`;
  const employeeNo = 'EMP-ADMIN';
  const fullName = 'System Admin';
  const role = 'ADMIN';
  const passwordHash = bcrypt.hashSync(cleanPassword, 10);

  await db.execute(`
    INSERT INTO users (id, employee_no, username, password_hash, full_name, role, phone, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
  `, [id, employeeNo, username, passwordHash, fullName, role, now, now]);

  console.log(`✅ Admin user '${username}' created successfully.`);
}

if (process.argv[1]?.endsWith('bootstrap-admin.ts') || process.argv[1]?.endsWith('bootstrap-admin.js')) {
  bootstrapAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Bootstrap admin error:', err);
      process.exit(1);
    });
}
