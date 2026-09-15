import { db, ensureDbConnected } from './connection';
import { runMigrations } from './migrate';
import bcrypt from 'bcryptjs';

export function seedDatabase(database = db) {
  runMigrations(database);

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync('demo123', 10);

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

  // 5. Production Orders
  const pos = [
    {
      id: 'PO-2026-0184',
      po_number: 'PO-2026-0184',
      map_po: 'MAP-PO-44821',
      customer: 'Nike',
      start_date: '2026-09-01',
      due_date: '2026-09-28',
      supervisor_id: 'usr-002',
      remarks: 'High priority export batch',
      status: 'CURRENT'
    },
    {
      id: 'PO-2026-0185',
      po_number: 'PO-2026-0185',
      map_po: 'MAP-PO-88129',
      customer: 'Adidas',
      start_date: '2026-09-05',
      due_date: '2026-09-30',
      supervisor_id: 'usr-002',
      remarks: 'Standard production',
      status: 'CURRENT'
    }
  ];

  const insertPo = database.prepare(`
    INSERT INTO production_orders (id, po_number, map_po, customer, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(po_number) DO UPDATE SET
      map_po = excluded.map_po,
      customer = excluded.customer,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);

  pos.forEach(p => insertPo.run(p.id, p.po_number, p.map_po, p.customer, p.start_date, p.due_date, p.supervisor_id, p.remarks, p.status, now, now));

  // 6. PO Operations
  const poOps = [
    { po_id: 'PO-2026-0184', op: 'QC_TEST' },
    { po_id: 'PO-2026-0184', op: 'PACKING' },
    { po_id: 'PO-2026-0184', op: 'AQL' },
    { po_id: 'PO-2026-0184', op: 'BOX_TRANSFER' },
    { po_id: 'PO-2026-0185', op: 'QC_TEST' },
    { po_id: 'PO-2026-0185', op: 'PACKING' }
  ];

  const insertPoOp = database.prepare(`
    INSERT INTO production_order_operations (production_order_id, operation)
    VALUES (?, ?)
    ON CONFLICT DO NOTHING
  `);

  poOps.forEach(o => insertPoOp.run(o.po_id, o.op));

  // 7. Sales Orders
  const sos = [
    {
      id: 'SO-77201',
      production_order_id: 'PO-2026-0184',
      so_number: 'SO-77201',
      map_so: 'MAP-SO-90317',
      product: 'Running Tee',
      style_code: 'ST-NK-902',
      colour: 'Black',
      size_range: 'S - XL',
      order_quantity: 2500,
      line_id: 'line-04',
      shift_id: 'shift-c',
      box_capacity: 12
    },
    {
      id: 'SO-77202',
      production_order_id: 'PO-2026-0184',
      so_number: 'SO-77202',
      map_so: 'MAP-SO-90318',
      product: 'Running Tee',
      style_code: 'ST-NK-902',
      colour: 'White',
      size_range: 'M - XXL',
      order_quantity: 1800,
      line_id: 'line-04',
      shift_id: 'shift-c',
      box_capacity: 12
    }
  ];

  const insertSo = database.prepare(`
    INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Progress', ?, ?)
    ON CONFLICT(so_number) DO UPDATE SET
      map_so = excluded.map_so,
      order_quantity = excluded.order_quantity,
      updated_at = excluded.updated_at
  `);

  sos.forEach(s => insertSo.run(s.id, s.production_order_id, s.so_number, s.map_so, s.product, s.style_code, s.colour, s.size_range, s.order_quantity, s.line_id, s.shift_id, s.box_capacity, now, now));

  // 8. Sample Item Units & QC Results & Boxes
  const qrCodes = [
    'PNFLS092632670', 'PNFLS092632671', 'PNFLS092632672', 'PNFLS092632673',
    'PNFLS092632674', 'PNFLS092632675', 'PNFLS092632676', 'PNFLS092632677',
    'PNFLS092639901', 'PNFLS092639902', 'PNFLS092639903'
  ];

  const insertItem = database.prepare(`
    INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
    VALUES (?, ?, 'SO-77201', 'L', 'PACKED', ?, ?)
    ON CONFLICT(qr_code) DO NOTHING
  `);

  qrCodes.forEach(qr => {
    insertItem.run(`itm-${qr}`, qr, now, now);
  });

  // 9. Boxes (BX-000218 with 8 items, BX-000245 with 3 items)
  const insertBox = database.prepare(`
    INSERT INTO boxes (id, box_number, sales_order_id, capacity, status, created_at)
    VALUES (?, ?, 'SO-77201', 12, 'OPEN', ?)
    ON CONFLICT(box_number) DO NOTHING
  `);

  insertBox.run('box-218', 'BX-000218', now);
  insertBox.run('box-245', 'BX-000245', now);

  const insertBoxItem = database.prepare(`
    INSERT INTO box_items (box_id, item_id, packed_by, packed_at)
    VALUES (?, ?, 'usr-001', ?)
    ON CONFLICT DO NOTHING
  `);

  qrCodes.slice(0, 8).forEach(qr => {
    insertBoxItem.run('box-218', `itm-${qr}`, now);
  });

  qrCodes.slice(8, 11).forEach(qr => {
    insertBoxItem.run('box-245', `itm-${qr}`, now);
  });

  // 10. Alerts
  const insertAlert = database.prepare(`
    INSERT INTO alerts (id, user_id, role_target, category, severity, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  insertAlert.run('alt-001', 'usr-001', 'OPERATOR', 'QUALITY', 'SUCCESS', 'AQL Inspection Available', 'Box BX-000217 passed AQL inspection.', now);
  insertAlert.run('alt-002', 'usr-001', 'OPERATOR', 'WORK', 'INFO', 'Box Almost Full', 'Box BX-000218 reached 8/12 items.', now);

  console.log('✅ SQLite Database Idempotent Seed Completed.');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  ensureDbConnected().then(() => seedDatabase());
}
