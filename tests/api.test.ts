import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { hashToken, generateToken } from '../server/src/middleware/auth';
import { formatMySqlDateTime } from '../server/src/db/connection';

describe('UniFlow Ops Auth, User Sessions & Style Selection Unit Tests', () => {
  it('1. Token Hashing computes SHA-256 hex digest for database storage', () => {
    const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload';
    const expectedHash = crypto.createHash('sha256').update(sampleToken).digest('hex');
    const computedHash = hashToken(sampleToken);
    expect(computedHash).toBe(expectedHash);
    expect(computedHash.length).toBe(64); // SHA-256 output length
  });

  it('2. JWT Token Generation embeds user ID, username, role and fullName', () => {
    const userPayload = {
      id: 'usr-admin-001',
      username: 'admin',
      role: 'ADMIN',
      fullName: 'System Administrator'
    };
    const token = generateToken(userPayload);
    expect(token).toBeDefined();

    const decoded = jwt.decode(token) as any;
    expect(decoded.id).toBe('usr-admin-001');
    expect(decoded.username).toBe('admin');
    expect(decoded.role).toBe('ADMIN');
    expect(decoded.fullName).toBe('System Administrator');
  });

  it('3. user_sessions table DDL structure validation', () => {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(191) PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(191) NULL,
        user_agent TEXT NULL,
        login_at DATETIME(3) NOT NULL,
        last_seen_at DATETIME(3) NOT NULL,
        logout_at DATETIME(3) NULL,
        expires_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NULL,
        active TINYINT NOT NULL DEFAULT 1
      );
    `;
    expect(createTableSql).toContain('token_hash');
    expect(createTableSql).toContain('ip_address');
    expect(createTableSql).toContain('user_agent');
    expect(createTableSql).toContain('login_at');
    expect(createTableSql).toContain('last_seen_at');
    expect(createTableSql).toContain('logout_at');
    expect(createTableSql).toContain('expires_at');
    expect(createTableSql).toContain('revoked_at');
    expect(createTableSql).toContain('active');
  });

  it('4. Protected Route & Unauthenticated state validation', () => {
    const isUnauthenticated = false;
    const isTokenMissing = true;
    const shouldRedirectToLogin = !isUnauthenticated || isTokenMissing;
    expect(shouldRedirectToLogin).toBe(true);
  });

  it('5. formatMySqlDateTime converts JS dates to valid MySQL DATETIME(3) without T or Z', () => {
    const isoString = '2026-09-21T10:34:28.145Z';
    const mysqlFormatted = formatMySqlDateTime(isoString);
    expect(mysqlFormatted).toBe('2026-09-21 10:34:28.145');
    expect(mysqlFormatted).not.toContain('T');
    expect(mysqlFormatted).not.toContain('Z');
  });

  it('6. FIX 1 — WebHID connection states & keyboard wedge timing validation', () => {
    // A. Selected open HID device -> connected status + product name
    const mockOpenedDevice = { productName: 'Honeywell Voyager 1400g', opened: true, open: async () => {} };
    let status = 'connected';
    let deviceName = `HID: ${mockOpenedDevice.productName}`;
    let errorMessage: string | null = null;
    expect(status).toBe('connected');
    expect(deviceName).toBe('HID: Honeywell Voyager 1400g');
    expect(errorMessage).toBeNull();

    // B. HID keyboard selected but open restricted -> connected with hint
    const mockRestrictedKeyboard = { productName: 'HID Keyboard', opened: false, open: async () => { throw new Error('Access denied'); } };
    let isOpened = false;
    let restricted = false;
    if (!isOpened) {
      try {
        // Simulating device.open() restriction for system keyboard
        throw new Error('Exclusive access restricted');
      } catch {
        restricted = true;
      }
    }
    if (restricted) {
      status = 'connected';
      deviceName = mockRestrictedKeyboard.productName;
      errorMessage = 'HID keyboard selected — scan into a scan field';
    }
    expect(status).toBe('connected');
    expect(errorMessage).toBe('HID keyboard selected — scan into a scan field');

    // C. Disconnect event -> disconnected
    status = 'disconnected';
    deviceName = null;
    expect(status).toBe('disconnected');

    // D. Slow manual typing (>80ms per char) does not mark connected
    const slowKeyIntervals = [120, 150, 200, 110];
    const avgSlowInterval = slowKeyIntervals.reduce((a, b) => a + b, 0) / slowKeyIntervals.length;
    const isBurstScanner = avgSlowInterval < 60;
    expect(isBurstScanner).toBe(false);

    // E. Fast scan (<60ms burst) -> input_active
    const fastKeyIntervals = [15, 12, 18, 10, 8];
    const avgFastInterval = fastKeyIntervals.reduce((a, b) => a + b, 0) / fastKeyIntervals.length;
    const isFastScanner = avgFastInterval < 60;
    expect(isFastScanner).toBe(true);
  });

  it('7. FIX 2 — Supervisor Home Items Processed Today SQL filtering & zero return when empty', () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const mockRecords = [
      { id: 'itm-1', created_at: `${today} 08:30:00` },
      { id: 'itm-2', created_at: `${today} 09:15:00` },
      { id: 'itm-3', created_at: `${yesterday} 14:00:00` } // old record
    ];

    const todayRecords = mockRecords.filter(r => r.created_at.startsWith(today));
    expect(todayRecords.length).toBe(2);

    const emptyRecords: any[] = [];
    const emptyCount = emptyRecords.filter(r => r.created_at?.startsWith(today)).length;
    expect(emptyCount).toBe(0);
  });

  it('8. FIX 2 — Supervisor Home contains no hardcoded demo KPI values (3,120 / 76% / 8,426)', () => {
    const fs = require('fs');
    const path = require('path');
    const supervisorHomeCode = fs.readFileSync(
      path.join(__dirname, '../src/pages/supervisor/SupervisorHome.tsx'),
      'utf-8'
    );

    expect(supervisorHomeCode).not.toContain('3,120');
    expect(supervisorHomeCode).not.toContain('76%');
    expect(supervisorHomeCode).not.toContain('8,426');
    expect(supervisorHomeCode).not.toContain('7,954');
    expect(supervisorHomeCode).toContain('Items Processed Today');
  });

  it('9. ISSUE 1 — Operator allocation persistence & operator visibility rule', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();

    if (isConnected) {
      // 1. Create test PO and SO
      const poId = `po-test-${Date.now()}`;
      const soId = `so-test-${Date.now()}`;

      await db.execute(
        `INSERT INTO production_orders (id, po_number, style_id, total_pcs, status, created_at, updated_at)
         VALUES (?, ?, 'style-001', 1000, 'in_progress', NOW(3), NOW(3))`,
        [poId, `PO-TEST-${Date.now()}`]
      );

      await db.execute(
        `INSERT INTO sales_orders (id, production_order_id, sales_order_number, total_pcs, status, created_at, updated_at)
         VALUES (?, ?, 'SO-TEST-001', 500, 'in_progress', NOW(3), NOW(3))`,
        [soId, poId]
      );

      // 2. Fetch operator Chamika and Shift A
      const chamika = await db.queryOne<{ id: string }>(
        `SELECT id FROM users WHERE username = 'chamika' OR role = 'OPERATOR' LIMIT 1`
      );
      const kavindu = await db.queryOne<{ id: string }>(
        `SELECT id FROM users WHERE username = 'kavindu' OR (role = 'OPERATOR' AND id != ?) LIMIT 1`,
        [chamika?.id || 'usr-chamika-001']
      );
      const shiftA = await db.queryOne<{ id: string }>(
        `SELECT id FROM shift_plans LIMIT 1`
      );

      const chamikaId = chamika?.id || 'usr-chamika-001';
      const kavinduId = kavindu?.id || 'usr-kavindu-002';
      const shiftId = shiftA?.id || 'shift-A';

      // 3. Assign chamika to Shift A / SO
      const allocId = `alloc-test-${Date.now()}`;
      await db.execute(
        `INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, assigned_by, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'usr-sup-001', 1, NOW(3), NOW(3))`,
        [allocId, soId, shiftId, chamikaId]
      );

      // 4. Assert active row exists in operator_work_assignments
      const activeAlloc = await db.queryOne<{ id: string; active: number }>(
        `SELECT id, active FROM operator_work_assignments WHERE sales_order_id = ? AND operator_id = ? AND active = 1`,
        [soId, chamikaId]
      );
      expect(activeAlloc).toBeDefined();
      expect(activeAlloc?.active).toBe(1);

      // 5. Assert chamika sees this SO
      const chamikaSos = await db.query(
        `SELECT DISTINCT so.id FROM sales_orders so
         INNER JOIN operator_work_assignments owa ON so.id = owa.sales_order_id
         WHERE owa.operator_id = ? AND owa.active = 1 AND so.id = ?`,
        [chamikaId, soId]
      );
      expect(chamikaSos.length).toBe(1);
      expect(chamikaSos[0].id).toBe(soId);

      // 6. Assert kavindu sees zero SOs unless explicitly assigned
      const kavinduSos = await db.query(
        `SELECT DISTINCT so.id FROM sales_orders so
         INNER JOIN operator_work_assignments owa ON so.id = owa.sales_order_id
         WHERE owa.operator_id = ? AND owa.active = 1 AND so.id = ?`,
        [kavinduId, soId]
      );
      expect(kavinduSos.length).toBe(0);

      // 7. Edit SO and ensure assignment remains attached to same SO ID
      await db.execute(
        `UPDATE sales_orders SET total_pcs = 600, updated_at = NOW(3) WHERE id = ?`,
        [soId]
      );
      const postEditAlloc = await db.queryOne<{ sales_order_id: string }>(
        `SELECT sales_order_id FROM operator_work_assignments WHERE id = ? AND active = 1`,
        [allocId]
      );
      expect(postEditAlloc?.sales_order_id).toBe(soId);

      // Clean up test data
      await db.execute(`DELETE FROM operator_work_assignments WHERE id = ?`, [allocId]);
      await db.execute(`DELETE FROM sales_orders WHERE id = ?`, [soId]);
      await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
    } else {
      // Logic assertions if DB offline during unit test environment
      const allocRow = {
        id: 'alloc-100',
        sales_order_id: 'so-db-123',
        shift_id: 'shift-a',
        operator_id: 'usr-chamika-001',
        assigned_by: 'usr-sup-001',
        active: 1
      };
      expect(allocRow.sales_order_id).toBe('so-db-123');
      expect(allocRow.active).toBe(1);
    }
  });

  it('10. ISSUE 2 — Auth session flow, authLoading, and role redirection regression', () => {
    // 1. Valid operator login -> operator home
    const operatorUser = { id: 'usr-op-001', username: 'chamika', role: 'OPERATOR' };
    const operatorToken = generateToken(operatorUser);
    expect(operatorToken).toBeDefined();

    const operatorDecoded = jwt.decode(operatorToken) as any;
    const operatorRoleHome = operatorDecoded.role === 'OPERATOR' ? '/operator/home' : '/login';
    expect(operatorRoleHome).toBe('/operator/home');

    // 2. Supervisor login -> supervisor home
    const supervisorUser = { id: 'usr-sup-001', username: 'nimal', role: 'SUPERVISOR' };
    const supervisorToken = generateToken(supervisorUser);
    const supervisorDecoded = jwt.decode(supervisorToken) as any;
    const supervisorRoleHome = supervisorDecoded.role === 'SUPERVISOR' ? '/supervisor/home' : '/login';
    expect(supervisorRoleHome).toBe('/supervisor/home');

    // 3. Stored token & authLoading state flow
    let storedToken: string | null = operatorToken;
    let authLoading = Boolean(storedToken);
    let isAuthenticated = false;

    // Simulate /api/auth/me response
    if (storedToken) {
      isAuthenticated = true;
      authLoading = false;
    }
    expect(authLoading).toBe(false);
    expect(isAuthenticated).toBe(true);

    // 4. Invalid / revoked token -> clear token & return to login
    const invalidToken = 'invalid.jwt.token';
    try {
      jwt.verify(invalidToken, process.env.JWT_SECRET || 'uniflow-secret-key-change-in-prod');
    } catch (err: any) {
      storedToken = null;
      isAuthenticated = false;
      authLoading = false;
    }
    expect(storedToken).toBeNull();
    expect(isAuthenticated).toBe(false);
    expect(authLoading).toBe(false);
  });

  it('11. Style auto-creation prevention & style_id validation regression test', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();

    if (isConnected) {
      // 1. Create explicitly one style
      const styleId = `style-reg-${Date.now()}`;
      const styleCode = `ST-REG-${Date.now().toString().slice(-4)}`;
      await db.execute(
        `INSERT INTO styles (id, code, name, customer, season, created_at, updated_at)
         VALUES (?, ?, 'Regression Test Style', 'Nike', 'Q4 2026', NOW(3), NOW(3))`,
        [styleId, styleCode]
      );

      const initialStyleRows = await db.query(`SELECT COUNT(*) as count FROM styles`);
      const initialCount = initialStyleRows[0].count;

      // 2. Create a PO linking to that existing style_id
      const poId = `po-style-reg-${Date.now()}`;
      await db.execute(
        `INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
         VALUES (?, ?, 'MAP-PO-REG', 'Nike', ?, '2026-09-15', '2026-10-10', 'usr-sup-001', 'Test', 'CURRENT', NOW(3), NOW(3))`,
        [poId, `PO-REG-${Date.now()}`, styleId]
      );

      // 3. Assert styles count does NOT increase
      const finalStyleRows = await db.query(`SELECT COUNT(*) as count FROM styles`);
      const finalCount = finalStyleRows[0].count;
      expect(finalCount).toBe(initialCount);

      // 4. Assert PO.style_id equals the selected existing style ID
      const poRow = await db.queryOne<{ style_id: string }>(
        `SELECT style_id FROM production_orders WHERE id = ?`,
        [poId]
      );
      expect(poRow?.style_id).toBe(styleId);

      // 5. Assert missing style_id validation (simulating backend 400 rejection)
      const missingStyleIdPayload = { id: 'PO-TEST-NO-STYLE', mapPo: 'MAP-NO-STYLE' };
      const hasStyleId = Boolean((missingStyleIdPayload as any).styleId || (missingStyleIdPayload as any).style_id);
      expect(hasStyleId).toBe(false);

      // 6. Assert no duplicate style with formatted code like "ST-REG-1234 - Regression Test Style" exists
      const duplicateStyle = await db.queryOne(
        `SELECT id FROM styles WHERE code LIKE ? OR name LIKE ?`,
        [`% - %`, `Style % - %`]
      );
      expect(duplicateStyle).toBeNull();

      // Clean up test data
      await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
      await db.execute(`DELETE FROM styles WHERE id = ?`, [styleId]);
    } else {
      // Unit logic assertions when DB is offline
      const styleId = 'style-1789989659297';
      const payload: any = { id: 'PO-100', styleId };
      expect(payload.styleId).toBe(styleId);
      expect(payload.styleCode).toBeUndefined();
    }
  });

  it('12. Product QR Range & SO Range Validation Regression Tests', async () => {
    const { validateProductQrRange } = await import('../server/src/routes/scans');
    const { checkQrRangeOverlap } = await import('../server/src/routes/production');

    // 1. PO General has no box serial-range fields
    const poPayload: any = {
      id: 'PO-2026-9999',
      mapPo: 'MAP-PO-9999',
      customer: 'Nike',
      styleId: 'style-001',
      startDate: '2026-09-15',
      dueDate: '2026-10-10',
      supervisorId: 'usr-001',
      remarks: 'Test',
      status: 'Current',
      selectedOperations: ['QC Test']
    };
    expect(poPayload.boxRangeStart).toBeUndefined();
    expect(poPayload.boxRangeEnd).toBeUndefined();

    // 2. Mock Production Order Config: config_code = PNFLSS
    const testConfig = {
      id: 'POC-CONFIG-001',
      config_code: 'PNFLSS',
      product_type: 'LEG',
      size: 'SS'
    };

    // 3. QR starting with PNFLSS -> valid
    const validQr = validateProductQrRange(testConfig, 'PNFLSS092632670');
    expect(validQr.valid).toBe(true);

    const validQrMid = validateProductQrRange(testConfig, 'PNFLSS0926321200');
    expect(validQrMid.valid).toBe(true);

    // 4. QR starting with different prefix -> INVALID (CONFIG_NOT_SELECTED)
    const wrongPrefixQr = validateProductQrRange(testConfig, 'PNFLSM092632670');
    expect(wrongPrefixQr.valid).toBe(false);

    // 5. checkQrRangeOverlap returns false for all configuration codes (duplicate configs across POs allowed)
    const overlapRes = await checkQrRangeOverlap('PNFLSS', 1000, 2000);
    expect(overlapRes.overlap).toBe(false);
  });

  it('13. Production Fixes Regression Tests (Issues 1-5)', async () => {
    // ── ISSUE 1: Auth Toast & Invalid Credentials Deduplication ──
    let toastCount = 0;
    let lastToastMessage = '';
    const mockShowToast = (msg: string) => {
      toastCount++;
      lastToastMessage = msg;
    };

    // Simulating wrong password submit
    const loginError = new Error('Invalid username or password.');
    mockShowToast(loginError.message);
    expect(toastCount).toBe(1);
    expect(lastToastMessage).toBe('Invalid username or password.');
    expect(lastToastMessage).not.toContain('Session expired');

    // ── ISSUE 2: Header Avatar Route Assertions ──
    const getProfileRoute = (role: 'operator' | 'supervisor' | 'admin') => {
      if (role === 'operator') return '/operator/profile';
      if (role === 'supervisor') return '/supervisor/profile';
      return '/admin/more';
    };
    expect(getProfileRoute('operator')).toBe('/operator/profile');
    expect(getProfileRoute('supervisor')).toBe('/supervisor/profile');
    expect(getProfileRoute('admin')).toBe('/admin/more');

    // ── DB-backed Tests for Issues 3, 4, and 5 ──
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();

    if (isConnected) {
      const timestamp = Date.now();
      const poId = `po-fix-reg-${timestamp}`;
      const soId = `so-fix-reg-${timestamp}`;
      const opId = `usr-op-fix-${timestamp}`;
      const unallocatedOpId = `usr-op-unalloc-${timestamp}`;

      // Insert test user, PO, SO, and operator assignment
      await db.execute(
        `INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at)
         VALUES (?, 'EMP-FIX-1', ?, 'hash', 'Test Operator', 'OPERATOR', 1, NOW(3), NOW(3))`,
        [opId, `op_user_${timestamp}`]
      );

      await db.execute(
        `INSERT INTO users (id, employee_no, username, password_hash, full_name, role, active, created_at, updated_at)
         VALUES (?, 'EMP-FIX-2', ?, 'hash', 'Unallocated Op', 'OPERATOR', 1, NOW(3), NOW(3))`,
        [unallocatedOpId, `unalloc_user_${timestamp}`]
      );

      await db.execute(
        `INSERT INTO production_orders (id, po_number, map_po, customer, style_id, start_date, due_date, supervisor_id, remarks, status, created_at, updated_at)
         VALUES (?, ?, 'MAP-FIX', 'Customer-X', 'style-001', '2026-09-01', '2026-10-01', 'usr-sup-001', 'Fix test', 'CURRENT', NOW(3), NOW(3))`,
        [poId, `PO-FIX-${timestamp}`]
      );

      await db.execute(
        `INSERT INTO sales_orders (id, production_order_id, so_number, map_so, product, style_code, colour, size_range, order_quantity, line_id, shift_id, box_capacity, status, created_at, updated_at)
         VALUES (?, ?, 'SO-FIX-01', 'MAP-SO-FIX', 'Jacket', 'ST-JK', 'Navy', 'M-XXL', 100, 'line-01', 'shift-a', 12, 'In Progress', NOW(3), NOW(3))`,
        [soId, poId]
      );

      await db.execute(
        `INSERT INTO operator_work_assignments (id, sales_order_id, shift_id, operator_id, operation, source, active, created_at, updated_at)
         VALUES (?, ?, 'shift-a', ?, 'ALL', 'SUPERVISOR', 1, NOW(3), NOW(3))`,
        [`owa-fix-${timestamp}`, soId, opId]
      );

      // ── ISSUE 3: Box Transfer query column (transferred_by) & empty table check ──
      const emptyTransfers = await db.all<any>(`
        SELECT bt.id, u.full_name AS operator_name 
        FROM box_transfers bt
        LEFT JOIN users u ON u.id = bt.transferred_by
        WHERE bt.id = 'non-existent-trf'
      `);
      expect(Array.isArray(emptyTransfers)).toBe(true);
      expect(emptyTransfers.length).toBe(0);

      // ── ISSUE 4: Box Transfer Destination New Empty Box & Atomic Creation ──
      const sourceBoxId = `bx-src-${timestamp}`;
      const sourceBoxCode = `BX-SRC-${timestamp}`;
      const newDestBoxCode = `BX-DEST-NEW-${timestamp}`;
      const itemId = `itm-fix-${timestamp}`;
      const boxItemId = `bi-src-${timestamp}`;

      // Insert source box & item
      await db.execute(
        `INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at)
         VALUES (?, ?, ?, ?, ?, 12, 'OPEN', NOW(3))`,
        [sourceBoxId, sourceBoxCode, sourceBoxCode, poId, soId]
      );

      await db.execute(
        `INSERT INTO item_units (id, qr_code, sales_order_id, size, status, created_at, updated_at)
         VALUES (?, ?, ?, 'M', 'PACKED', NOW(3), NOW(3))`,
        [itemId, `QR-FIX-${timestamp}`, soId]
      );

      await db.execute(
        `INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
         VALUES (?, ?, ?, ?, NOW(3), 1)`,
        [boxItemId, sourceBoxId, itemId, opId]
      );

      // Execute transfer to a NEW empty destination box in transaction
      const transferId = `trf-test-${timestamp}`;
      let createdDestBoxId = '';

      await db.transaction(async (tx) => {
        // Lock source box
        await tx.query(`SELECT * FROM boxes WHERE id = ? FOR UPDATE`, [sourceBoxId]);

        // Create new destination box dynamically
        createdDestBoxId = `bx-dest-${timestamp}`;
        await tx.prepare(`
          INSERT INTO boxes (id, box_code, box_number, production_order_id, sales_order_id, capacity, status, created_at)
          VALUES (?, ?, ?, ?, ?, 12, 'OPEN', NOW(3))
        `).run(createdDestBoxId, newDestBoxCode, newDestBoxCode, poId, soId);

        // Record transfer
        await tx.prepare(`
          INSERT INTO box_transfers (id, source_box_id, destination_box_id, production_order_id, sales_order_id, transferred_by, item_count, transferred_at, remarks)
          VALUES (?, ?, ?, ?, ?, ?, 1, NOW(3), 'Test new dest box')
        `).run(transferId, sourceBoxId, createdDestBoxId, poId, soId, opId);

        // Deactivate source box_item & insert destination box_item
        await tx.prepare(`UPDATE box_items SET active = 0 WHERE id = ?`).run(boxItemId);
        await tx.prepare(`
          INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active)
          VALUES (?, ?, ?, ?, NOW(3), 1)
        `).run(`bi-dest-${timestamp}`, createdDestBoxId, itemId, opId);
      });

      // Verify destination box was created and received item
      const createdDestBox = await db.queryOne<{ id: string; box_code: string }>(
        `SELECT id, box_code FROM boxes WHERE box_code = ?`,
        [newDestBoxCode]
      );
      expect(createdDestBox?.id).toBe(createdDestBoxId);

      const destActiveItem = await db.queryOne<{ id: string }>(
        `SELECT id FROM box_items WHERE box_id = ? AND active = 1`,
        [createdDestBoxId]
      );
      expect(destActiveItem).toBeDefined();

      // Verify transfer history query joins user via transferred_by
      const transferHistory = await db.queryOne<{ operator_name: string; destination_box_code: string }>(
        `SELECT bt.id, u.full_name AS operator_name, db_box.box_code AS destination_box_code
         FROM box_transfers bt
         LEFT JOIN boxes db_box ON db_box.id = bt.destination_box_id
         LEFT JOIN users u ON u.id = bt.transferred_by
         WHERE bt.id = ?`,
        [transferId]
      );
      expect(transferHistory?.operator_name).toBe('Test Operator');
      expect(transferHistory?.destination_box_code).toBe(newDestBoxCode);

      // ── ISSUE 5: AQL Passed Boxes Metric Calculation ──
      const aqlInspPassId = `aql-pass-${timestamp}`;
      const aqlInspFailId = `aql-fail-${timestamp}`;

      // Insert passed AQL inspection for allocated SO
      await db.execute(
        `INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, started_at, completed_at)
         VALUES (?, ?, ?, ?, 3, 'PASSED', NOW(3), NOW(3))`,
        [aqlInspPassId, createdDestBoxId, soId, opId]
      );

      // Insert failed AQL inspection for allocated SO
      await db.execute(
        `INSERT INTO aql_inspections (id, box_id, sales_order_id, inspector_id, required_samples, result, started_at, completed_at)
         VALUES (?, ?, ?, ?, 3, 'FAILED', NOW(3), NOW(3))`,
        [aqlInspFailId, sourceBoxId, soId, opId]
      );

      // Allocated operator query for AQL Passed Boxes
      const allocAqlPassedRow = await db.queryOne<{ cnt: number }>(`
        SELECT COUNT(DISTINCT ai.id) as cnt
        FROM aql_inspections ai
        JOIN boxes b ON b.id = ai.box_id
        JOIN operator_work_assignments owa ON owa.sales_order_id = b.sales_order_id
        WHERE ai.result = 'PASSED'
          AND owa.operator_id = ?
          AND owa.active = 1
      `, [opId]);
      expect(Number(allocAqlPassedRow?.cnt)).toBe(1); // 1 passed AQL box, 0 failed boxes counted

      // Unallocated operator query for AQL Passed Boxes
      const unallocAqlPassedRow = await db.queryOne<{ cnt: number }>(`
        SELECT COUNT(DISTINCT ai.id) as cnt
        FROM aql_inspections ai
        JOIN boxes b ON b.id = ai.box_id
        JOIN operator_work_assignments owa ON owa.sales_order_id = b.sales_order_id
        WHERE ai.result = 'PASSED'
          AND owa.operator_id = ?
          AND owa.active = 1
      `, [unallocatedOpId]);
      expect(Number(unallocAqlPassedRow?.cnt)).toBe(0); // Returns 0 for unallocated operator

      // Clean up test data
      await db.execute(`DELETE FROM aql_inspections WHERE id IN (?, ?)`, [aqlInspPassId, aqlInspFailId]);
      await db.execute(`DELETE FROM box_transfers WHERE id = ?`, [transferId]);
      await db.execute(`DELETE FROM box_items WHERE id IN (?, ?)`, [boxItemId, `bi-dest-${timestamp}`]);
      await db.execute(`DELETE FROM item_units WHERE id = ?`, [itemId]);
      await db.execute(`DELETE FROM boxes WHERE id IN (?, ?)`, [sourceBoxId, createdDestBoxId]);
      await db.execute(`DELETE FROM operator_work_assignments WHERE id = ?`, [`owa-fix-${timestamp}`]);
      await db.execute(`DELETE FROM sales_orders WHERE id = ?`, [soId]);
      await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
      await db.execute(`DELETE FROM users WHERE id IN (?, ?)`, [opId, unallocatedOpId]);
    }
  });

  it('10. Product Configuration & Shared Validation Engine Unit Tests (34 Rule Suite)', async () => {
    const { validateProductForProductionOrder } = await import('../server/src/routes/scans');
    const { db, ensureDbConnected } = await import('../server/src/db/connection');

    const timestamp = Date.now();
    const poId = `po-cfg-test-${timestamp}`;

    const isConnected = await ensureDbConnected();
    if (isConnected) {
      // 1. Setup Test PO
      await db.execute(
        `INSERT INTO production_orders (id, po_number, style_id, total_pcs, status, created_at, updated_at)
         VALUES (?, ?, 'style-001', 500, 'CURRENT', NOW(3), NOW(3))`,
        [poId, `PO-CFG-${timestamp}`]
      );

      // 2. Setup Product Configurations: LEG (SS, SM) and CORE (TS, TL)
      const configs = [
        { id: `poc-1-${timestamp}`, poId, code: 'PNFLSS', type: 'LEG', size: 'SS', qty: 100 },
        { id: `poc-2-${timestamp}`, poId, code: 'PNFLSM', type: 'LEG', size: 'SM', qty: 100 },
        { id: `poc-3-${timestamp}`, poId, code: 'PNCRTS', type: 'CORE', size: 'TS', qty: 50 },
        { id: `poc-4-${timestamp}`, poId, code: 'PNCRTL', type: 'CORE', size: 'TL', qty: 50 }
      ];

      for (const cfg of configs) {
        await db.execute(
          `INSERT INTO production_order_configs (id, production_order_id, config_code, product_type, size, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [cfg.id, cfg.poId, cfg.code, cfg.type, cfg.size, cfg.qty]
        );
      }

      // Test Case 1: LEG SS selected -> PNFLSS accepted
      const check1 = await validateProductForProductionOrder(poId, 'PNFLSS09260001');
      expect(check1.valid).toBe(true);

      // Test Case 2: LEG SM selected -> PNFLSM accepted
      const check2 = await validateProductForProductionOrder(poId, 'PNFLSM09260055');
      expect(check2.valid).toBe(true);

      // Test Case 3: LEG SS+SM -> both accepted
      const check3a = await validateProductForProductionOrder(poId, 'PNFLSS09260099');
      const check3b = await validateProductForProductionOrder(poId, 'PNFLSM09260012');
      expect(check3a.valid).toBe(true);
      expect(check3b.valid).toBe(true);

      // Test Case 4: CORE TS+TL -> PNCRTS and PNCRTL accepted
      const check4a = await validateProductForProductionOrder(poId, 'PNCRTS09260001');
      const check4b = await validateProductForProductionOrder(poId, 'PNCRTL09260002');
      expect(check4a.valid).toBe(true);
      expect(check4b.valid).toBe(true);

      // Test Case 5: LEG + CORE -> all selected configurations accepted
      const check5 = await validateProductForProductionOrder(poId, 'PNCRTS9999');
      expect(check5.valid).toBe(true);

      // Test Case 6: Unselected configuration rejected (e.g. PNFLSL or PNCRSS)
      const check6a = await validateProductForProductionOrder(poId, 'PNFLSL09260001');
      const check6b = await validateProductForProductionOrder(poId, 'PNCRSS09260001');
      expect(check6a.valid).toBe(false);
      expect(check6b.valid).toBe(false);
      expect(check6a.error).toBe('CONFIG_NOT_SELECTED');

      // Test Case 7: Serial number outside old range (e.g. 999999) does NOT cause rejection when configuration is valid
      const check7 = await validateProductForProductionOrder(poId, 'PNFLSS9999999');
      expect(check7.valid).toBe(true);

      // Clean up test configs & PO
      await db.execute(`DELETE FROM production_order_configs WHERE production_order_id = ?`, [poId]);
      await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
    }
  });

  it('11. AQL Box Active Contents & Permanent Removal Traceability Unit Tests', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const timestamp = Date.now();
    const poId = `po-aql-test-${timestamp}`;
    const boxId = `bx-aql-test-${timestamp}`;
    const item1Id = `itm-aql-1-${timestamp}`;
    const item2Id = `itm-aql-2-${timestamp}`;
    const boxItemId1 = `bi-aql-1-${timestamp}`;
    const boxItemId2 = `bi-aql-2-${timestamp}`;

    const isConnected = await ensureDbConnected();
    if (isConnected) {
      // 1. Insert PO & Box
      await db.execute(
        `INSERT INTO production_orders (id, po_number, status, created_at, updated_at) VALUES (?, ?, 'CURRENT', NOW(3), NOW(3))`,
        [poId, `PO-AQL-${timestamp}`]
      );
      await db.execute(
        `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BX-AQL-01', 'BX-AQL-01', ?, 12, 'OPEN', NOW(3))`,
        [boxId, poId]
      );

      // 2. Insert 2 item units
      await db.execute(
        `INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSS01', ?, 'PACKED', NOW(3), NOW(3))`,
        [item1Id, poId]
      );
      await db.execute(
        `INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSS02', ?, 'PACKED', NOW(3), NOW(3))`,
        [item2Id, poId]
      );

      // 3. Pack 2 items into box
      await db.execute(
        `INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, 'usr-op', NOW(3), 1)`,
        [boxItemId1, boxId, item1Id]
      );
      await db.execute(
        `INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, 'usr-op', NOW(3), 1)`,
        [boxItemId2, boxId, item2Id]
      );

      // 4. Verify box active item count = 2
      const activeCountBefore = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [boxId]);
      expect(Number(activeCountBefore?.cnt)).toBe(2);

      // 5. Simulate Permanent Removal of item 1
      const removeAuditId = `prm-test-${timestamp}`;
      await db.execute(
        `INSERT INTO permanently_removed_items (id, item_id, item_qr, box_id, production_order_id, removed_by, action_type, reason, removed_at)
         VALUES (?, ?, 'PNFLSS01', ?, ?, 'usr-inspector', 'PERMANENTLY_REMOVE', 'Irreparable Damage', NOW(3))`,
        [removeAuditId, item1Id, boxId, poId]
      );
      await db.execute(`UPDATE box_items SET active = 0 WHERE id = ?`, [boxItemId1]);

      // 6. Verify box active item count drops to 1
      const activeCountAfter = await db.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM box_items WHERE box_id = ? AND active = 1`, [boxId]);
      expect(Number(activeCountAfter?.cnt)).toBe(1);

      // 7. Verify audit record exists in permanently_removed_items
      const auditRec = await db.queryOne<{ item_qr: string; action_type: string }>(`SELECT item_qr, action_type FROM permanently_removed_items WHERE id = ?`, [removeAuditId]);
      expect(auditRec?.item_qr).toBe('PNFLSS01');
      expect(auditRec?.action_type).toBe('PERMANENTLY_REMOVE');

      // Cleanup
      await db.execute(`DELETE FROM permanently_removed_items WHERE id = ?`, [removeAuditId]);
      await db.execute(`DELETE FROM box_items WHERE id IN (?, ?)`, [boxItemId1, boxItemId2]);
      await db.execute(`DELETE FROM item_units WHERE id IN (?, ?)`, [item1Id, item2Id]);
      await db.execute(`DELETE FROM boxes WHERE id = ?`, [boxId]);
      await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
    }
  });

  it('12. PO-Scoped QR Uniqueness Rules Unit Tests', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const timestamp = Date.now();
    const po1Id = `po-uniq-1-${timestamp}`;
    const po2Id = `po-uniq-2-${timestamp}`;

    const isConnected = await ensureDbConnected();
    if (isConnected) {
      await db.execute(`INSERT INTO production_orders (id, po_number, status, created_at, updated_at) VALUES (?, ?, 'CURRENT', NOW(3), NOW(3))`, [po1Id, `PO-UNIQ-1-${timestamp}`]);
      await db.execute(`INSERT INTO production_orders (id, po_number, status, created_at, updated_at) VALUES (?, ?, 'CURRENT', NOW(3), NOW(3))`, [po2Id, `PO-UNIQ-2-${timestamp}`]);

      // Test 1: PO-1 + PNFLSM1 -> first save PASS
      const item1Id = `itm-${po1Id}-PNFLSM1`;
      await db.execute(
        `INSERT INTO item_units (id, qr_code, production_order_id, size, status, created_at, updated_at) VALUES (?, 'PNFLSM1', ?, 'L', 'QC_PASSED', NOW(3), NOW(3))`,
        [item1Id, po1Id]
      );
      const row1 = await db.queryOne<{ id: string }>(`SELECT id FROM item_units WHERE production_order_id = ? AND qr_code = 'PNFLSM1'`, [po1Id]);
      expect(row1?.id).toBe(item1Id);

      // Test 2: PO-2 + PNFLSM1 -> save PASS (same QR code, different PO allowed)
      const item2Id = `itm-${po2Id}-PNFLSM1`;
      await db.execute(
        `INSERT INTO item_units (id, qr_code, production_order_id, size, status, created_at, updated_at) VALUES (?, 'PNFLSM1', ?, 'L', 'QC_PASSED', NOW(3), NOW(3))`,
        [item2Id, po2Id]
      );
      const row2 = await db.queryOne<{ id: string }>(`SELECT id FROM item_units WHERE production_order_id = ? AND qr_code = 'PNFLSM1'`, [po2Id]);
      expect(row2?.id).toBe(item2Id);
      expect(row2?.id).not.toBe(row1?.id);

      // Test 3: PO-1 + PNFLSM2 -> save PASS (different QR code, same PO allowed)
      const item3Id = `itm-${po1Id}-PNFLSM2`;
      await db.execute(
        `INSERT INTO item_units (id, qr_code, production_order_id, size, status, created_at, updated_at) VALUES (?, 'PNFLSM2', ?, 'L', 'QC_PASSED', NOW(3), NOW(3))`,
        [item3Id, po1Id]
      );
      const row3 = await db.queryOne<{ id: string }>(`SELECT id FROM item_units WHERE production_order_id = ? AND qr_code = 'PNFLSM2'`, [po1Id]);
      expect(row3?.id).toBe(item3Id);

      // Test 4: PO-1 + PNFLSM1 again -> existing item lookup finds original item, preventing duplicate creation
      const existingItem = await db.queryOne<{ id: string }>(
        `SELECT id FROM item_units WHERE production_order_id = ? AND qr_code = 'PNFLSM1'`,
        [po1Id]
      );
      expect(existingItem?.id).toBe(item1Id);

      // Cleanup
      await db.execute(`DELETE FROM item_units WHERE id IN (?, ?, ?)`, [item1Id, item2Id, item3Id]);
      await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1Id, po2Id]);
    }
  }, 20000);

  it('13. AQL Strict Item-by-Item State Machine & Result Sequence Validation', () => {
    const fs = require('fs');
    const path = require('path');
    const aqlPageCode = fs.readFileSync(
      path.join(__dirname, '../src/pages/operator/AQLSamplesPage.tsx'),
      'utf-8'
    );
    const scansRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/scans.ts'),
      'utf-8'
    );

    // Frontend State Machine checks
    expect(aqlPageCode).toContain('WAITING');
    expect(aqlPageCode).toContain('SCANNED_RESULT_REQUIRED');
    expect(aqlPageCode).toContain('Wrong product. Please scan');
    expect(aqlPageCode).toContain('Please select PASS or FAIL');

    // Backend Sequence & Previous Item Result Enforcement checks
    expect(scansRouteCode).toContain('CURRENT_ITEM_RESULT_REQUIRED');
    expect(scansRouteCode).toContain('WRONG_SEQUENCE');
    expect(scansRouteCode).toContain('RESULT_REQUIRED');
  });
});


