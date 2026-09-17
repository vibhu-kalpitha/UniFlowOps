import { db, ensureDbConnected } from './connection';
import { runMigrations } from './migrate';
import bcrypt from 'bcryptjs';

export function seedDatabase(database = db) {
  runMigrations(database);

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('demo123', 10);

  // Clear existing production & scan data
  database.exec(`
    DELETE FROM scan_events;
    DELETE FROM alerts;
    DELETE FROM aql_samples;
    DELETE FROM aql_inspections;
    DELETE FROM box_transfer_items;
    DELETE FROM box_transfers;
    DELETE FROM box_items;
    DELETE FROM boxes;
    DELETE FROM qc_fail_log;
    DELETE FROM qc_results;
    DELETE FROM item_units;
    DELETE FROM sales_orders;
    DELETE FROM production_order_operations;
    DELETE FROM production_orders;
  `);

  // 1. Users
  const users = [
    { id: 'usr-001', employee_no: 'EMP-101', username: 'chamika', full_name: 'Chamika Silva', role: 'OPERATOR', phone: '+94771234567' },
    { id: 'usr-002', employee_no: 'EMP-102', username: 'nimal', full_name: 'Nimal Perera', role: 'SUPERVISOR', phone: '+94772345678' },
    { id: 'usr-003', employee_no: 'EMP-100', username: 'admin', full_name: 'System Admin', role: 'ADMIN', phone: '+94773456789' },
    { id: 'usr-004', employee_no: 'EMP-104', username: 'kavindu', full_name: 'Kavindu Perera', role: 'OPERATOR', phone: '+94774567890' }
  ];

  const insertUser = database.prepare(`
    INSERT INTO users (id, employee_no, username, password_hash, full_name, role, phone, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      full_name = excluded.full_name,
      role = excluded.role,
      updated_at = excluded.updated_at
  `);

  users.forEach(u => insertUser.run(u.id, u.employee_no, u.username, passwordHash, u.full_name, u.role, u.phone, now, now));

  // 2. Production Lines
  const lines = [
    { id: 'line-01', code: 'LINE-01', name: 'Line 01' },
    { id: 'line-02', code: 'LINE-02', name: 'Line 02' },
    { id: 'line-03', code: 'LINE-03', name: 'Line 03' },
    { id: 'line-04', code: 'LINE-04', name: 'Line 04' }
  ];

  const insertLine = database.prepare(`
    INSERT OR REPLACE INTO production_lines (id, code, name, active)
    VALUES (?, ?, ?, 1)
  `);

  lines.forEach(l => insertLine.run(l.id, l.code, l.name));

  // 3. Fixed Shifts A-D
  const shifts = [
    { id: 'shift-a', code: 'A', name: 'Shift A', start_time: '06:00', end_time: '10:00' },
    { id: 'shift-b', code: 'B', name: 'Shift B', start_time: '10:00', end_time: '14:00' },
    { id: 'shift-c', code: 'C', name: 'Shift C', start_time: '14:00', end_time: '18:00' },
    { id: 'shift-d', code: 'D', name: 'Shift D', start_time: '18:00', end_time: '22:00' }
  ];

  const insertShift = database.prepare(`
    INSERT OR REPLACE INTO shifts (id, code, name, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  shifts.forEach(s => insertShift.run(s.id, s.code, s.name, s.start_time, s.end_time));

  // 4. Shift Members
  const shiftMembers = [
    { id: 'sm-1', shift_id: 'shift-c', operator_id: 'usr-001' }, // Chamika -> Shift C
    { id: 'sm-2', shift_id: 'shift-d', operator_id: 'usr-004' }  // Kavindu -> Shift D
  ];

  const insertShiftMember = database.prepare(`
    INSERT INTO shift_members (id, shift_id, operator_id, effective_from, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET shift_id = excluded.shift_id
  `);

  shiftMembers.forEach(sm => insertShiftMember.run(sm.id, sm.shift_id, sm.operator_id, now));

  console.log('✅ SQLite Cleaned: Production orders, boxes, and scan logs cleared.');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  ensureDbConnected().then(() => seedDatabase());
}
