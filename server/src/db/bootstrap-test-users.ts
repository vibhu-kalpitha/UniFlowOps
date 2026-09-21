import { db, ensureDbConnected } from './connection.js';
import { runMigrations } from './migrate.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

export async function bootstrapTestUsers(): Promise<void> {
  const connected = await ensureDbConnected();
  if (!connected) {
    console.error('❌ Database connection failed. Cannot bootstrap test users.');
    process.exit(1);
  }

  // Ensure database migrations are up to date
  await runMigrations();

  const userConfigs = [
    {
      role: 'ADMIN',
      usernameEnv: 'BOOTSTRAP_ADMIN_USERNAME',
      passwordEnv: 'BOOTSTRAP_ADMIN_PASSWORD',
      defaultUsername: 'admin',
      fullName: 'System Administrator',
      employeeNo: 'EMP-ADMIN-001'
    },
    {
      role: 'SUPERVISOR',
      usernameEnv: 'BOOTSTRAP_SUPERVISOR_USERNAME',
      passwordEnv: 'BOOTSTRAP_SUPERVISOR_PASSWORD',
      defaultUsername: 'supervisor',
      fullName: 'Nimal Perera',
      employeeNo: 'EMP-SUP-001'
    },
    {
      role: 'OPERATOR',
      usernameEnv: 'BOOTSTRAP_OPERATOR_USERNAME',
      passwordEnv: 'BOOTSTRAP_OPERATOR_PASSWORD',
      defaultUsername: 'operator',
      fullName: 'Chamika Silva',
      employeeNo: 'EMP-OP-001'
    }
  ];

  for (const config of userConfigs) {
    const username = (process.env[config.usernameEnv] || config.defaultUsername).trim();
    const rawPassword = process.env[config.passwordEnv];

    if (!rawPassword || !rawPassword.trim()) {
      console.warn(`⚠️ ${config.passwordEnv} is not set or empty in environment. Skipping ${config.role} user bootstrap.`);
      continue;
    }

    const cleanPassword = rawPassword.trim();

    // Idempotency check: check if username already exists
    const existing = await db.query<{ id: string; username: string }>(
      `SELECT id, username FROM users WHERE username = ?`,
      [username]
    );

    if (existing.length > 0) {
      console.log(`ℹ️ User '${username}' (${config.role}) already exists. Bootstrap skipped for this user.`);
      continue;
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const id = `usr-${config.role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const passwordHash = bcrypt.hashSync(cleanPassword, 10);

    await db.execute(`
      INSERT INTO users (id, employee_no, username, password_hash, full_name, role, phone, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
    `, [id, config.employeeNo, username, passwordHash, config.fullName, config.role, now, now]);

    console.log(`✅ Successfully bootstrapped ${config.role} user '${username}'.`);
  }
}

if (process.argv[1]?.endsWith('bootstrap-test-users.ts') || process.argv[1]?.endsWith('bootstrap-test-users.js')) {
  bootstrapTestUsers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Bootstrap test users error:', err);
      process.exit(1);
    });
}
