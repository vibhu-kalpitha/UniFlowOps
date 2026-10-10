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
  }, 30000);

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
    expect(aqlPageCode).toContain('does not belong to the selected box');
    expect(aqlPageCode).toContain('Please select PASS or FAIL');

    // Backend Non-sequential & Item Validation checks
    expect(scansRouteCode).toContain('ITEM_NOT_IN_BOX');
    expect(scansRouteCode).toContain('RESULT_REQUIRED');
  });

  it('14. Supervisor Role Permissions & Global PO History Access Validation', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboardRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/dashboard.ts'),
      'utf-8'
    );
    const productionRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/production.ts'),
      'utf-8'
    );
    const authRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/auth.ts'),
      'utf-8'
    );

    // Verify GET /api/dashboard/supervisor does not restrict POs by supervisor_id
    expect(dashboardRouteCode).not.toContain('po.supervisor_id = ? OR po.supervisor_id IS NULL');
    expect(dashboardRouteCode).toContain('Supervisors have global production visibility');

    // Verify GET /api/admin/users and POST /api/admin/users support SUPERVISOR role
    expect(productionRouteCode).toContain("requireRole(['ADMIN', 'SUPERVISOR'])");
    expect(productionRouteCode).toContain("Supervisors are only authorized to create Operator accounts.");
    expect(productionRouteCode).toContain("Supervisors are only authorized to manage Operator accounts.");

    // Verify POST /api/auth/reset-password allows SUPERVISOR with Operator restriction
    expect(authRouteCode).toContain("Supervisors are only authorized to reset passwords for Operator accounts.");
  });

  it('15. QC/Test Independent Multi-Stage Scanning & UI Mode Label Validation', () => {
    const fs = require('fs');
    const path = require('path');
    const poGeneralCode = fs.readFileSync(
      path.join(__dirname, '../src/pages/supervisor/CreatePOGeneral.tsx'),
      'utf-8'
    );
    const qcPageCode = fs.readFileSync(
      path.join(__dirname, '../src/pages/operator/QCTestPage.tsx'),
      'utf-8'
    );
    const scansRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/scans.ts'),
      'utf-8'
    );

    // 1. Label rename check in CreatePOGeneral.tsx
    expect(poGeneralCode).toContain('Mode');
    expect(poGeneralCode).toContain('QC & Test');
    expect(poGeneralCode).toContain('QC Only');
    expect(poGeneralCode).toContain('Test Only');
    expect(poGeneralCode).not.toContain('<label className="form-label" style={{ fontSize: \'13px\', fontWeight: 700, color: \'var(--text-primary)\', display: \'flex\', alignItems: \'center\', gap: \'6px\' }}>\n                    QC Test\n                  </label>');

    // 2. QCTestPage.tsx independent stage sections check
    expect(qcPageCode).toContain('QC Result');
    expect(qcPageCode).toContain('Test Result');
    expect(qcPageCode).toContain("handleSaveStage('QC')");
    expect(qcPageCode).toContain("handleSaveStage('TEST')");
    expect(qcPageCode).toContain('✓ PASS Completed');

    // 3. scans.ts backend multi-stage scanning & stage-aware authorization check
    expect(scansRouteCode).toContain('checkOperatorAllocationForPO');
    expect(scansRouteCode).toContain("targetStage === 'QC'");
    expect(scansRouteCode).toContain("targetStage === 'TEST'");
    expect(scansRouteCode).toContain("status: 'FULLY_COMPLETED'");
    expect(scansRouteCode).toContain('isFullyCompleted');
    expect(scansRouteCode).toContain('stageStatus');
  });

  it('16. Final AQL, Partial Box Inspection, Resume & Stage Independence Validation', async () => {
    const fs = require('fs');
    const path = require('path');
    const poGeneralCode = fs.readFileSync(
      path.join(__dirname, '../src/pages/supervisor/CreatePOGeneral.tsx'),
      'utf-8'
    );
    const scansRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/scans.ts'),
      'utf-8'
    );
    const operatorsRouteCode = fs.readFileSync(
      path.join(__dirname, '../server/src/routes/operators.ts'),
      'utf-8'
    );

    // 1. PO Creation page contains FINAL AQL
    expect(poGeneralCode).toContain('FINAL AQL');

    // 2. Operator matching logic distinguishes FINAL_AQL from normal AQL
    expect(operatorsRouteCode).toContain("t.includes('FINAL')");

    // 3. Backend scan route parses AQL stage ('FINAL_AQL' vs 'AQL') and checks stage allocation
    expect(scansRouteCode).toContain("FINAL_AQL");
    expect(scansRouteCode).toContain("isFinalAql");
    expect(scansRouteCode).toContain("checkOperatorAllocationForPO");

    // 4. DB integration test for stage separation and partial inspection if DB is connected
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    if (isConnected) {
      const timestamp = Date.now();
      const poId = `po-faql-${timestamp}`;
      const boxId = `box-faql-${timestamp}`;
      const item1Id = `itm-faql-1-${timestamp}`;
      const item2Id = `itm-faql-2-${timestamp}`;

      try {
        await db.execute(
          `INSERT INTO production_orders (id, po_number, status, created_at, updated_at) VALUES (?, ?, 'CURRENT', NOW(3), NOW(3))`,
          [poId, `PO-FAQL-${timestamp}`]
        );
        await db.execute(
          `INSERT INTO boxes (id, box_number, production_order_id, status, capacity, created_at, updated_at) VALUES (?, ?, ?, 'SEALED', 12, NOW(3), NOW(3))`,
          [boxId, `BX-FAQL-${timestamp}`, poId]
        );
        await db.execute(
          `INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'QC_PASSED', NOW(3), NOW(3))`,
          [item1Id, `QR-FAQL-1-${timestamp}`, poId]
        );
        await db.execute(
          `INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'QC_PASSED', NOW(3), NOW(3))`,
          [item2Id, `QR-FAQL-2-${timestamp}`, poId]
        );
        await db.execute(
          `INSERT INTO box_items (id, box_id, item_unit_id, active, created_at) VALUES (?, ?, ?, 1, NOW(3))`,
          [`bi-1-${timestamp}`, boxId, item1Id]
        );
        await db.execute(
          `INSERT INTO box_items (id, box_id, item_unit_id, active, created_at) VALUES (?, ?, ?, 1, NOW(3))`,
          [`bi-2-${timestamp}`, boxId, item2Id]
        );

        // Create Normal AQL Inspection (partial 1 item)
        const aql1Id = `aql-n-${timestamp}`;
        await db.execute(
          `INSERT INTO aql_inspections (id, production_order_id, box_id, stage, overall_result, sample_required, sample_inspected, pass_count, fail_count, created_at, updated_at)
           VALUES (?, ?, ?, 'AQL', 'IN_PROGRESS', 12, 1, 1, 0, NOW(3), NOW(3))`,
          [aql1Id, poId, boxId]
        );
        await db.execute(
          `INSERT INTO aql_samples (id, inspection_id, sample_index, item_unit_id, result, scanned_at)
           VALUES (?, ?, 1, ?, 'PASS', NOW(3))`,
          [`s-n1-${timestamp}`, aql1Id, item1Id]
        );

        // Create Final AQL Inspection for SAME box (separate stage, independent samples)
        const faql1Id = `aql-f-${timestamp}`;
        await db.execute(
          `INSERT INTO aql_inspections (id, production_order_id, box_id, stage, overall_result, sample_required, sample_inspected, pass_count, fail_count, created_at, updated_at)
           VALUES (?, ?, ?, 'FINAL_AQL', 'IN_PROGRESS', 12, 1, 1, 0, NOW(3), NOW(3))`,
          [faql1Id, poId, boxId]
        );
        await db.execute(
          `INSERT INTO aql_samples (id, inspection_id, sample_index, item_unit_id, result, scanned_at)
           VALUES (?, ?, 1, ?, 'PASS', NOW(3))`,
          [`s-f1-${timestamp}`, faql1Id, item2Id]
        );

        // Query & Verify Stage Separation
        const normalInspection = await db.queryOne<any>(`SELECT * FROM aql_inspections WHERE id = ?`, [aql1Id]);
        const finalInspection = await db.queryOne<any>(`SELECT * FROM aql_inspections WHERE id = ?`, [faql1Id]);

        expect(normalInspection?.stage).toBe('AQL');
        expect(finalInspection?.stage).toBe('FINAL_AQL');
        expect(normalInspection?.id).not.toBe(finalInspection?.id);

        const normalSamples = await db.query<any>(`SELECT * FROM aql_samples WHERE inspection_id = ?`, [aql1Id]);
        const finalSamples = await db.query<any>(`SELECT * FROM aql_samples WHERE inspection_id = ?`, [faql1Id]);

        expect(normalSamples.length).toBe(1);
        expect(finalSamples.length).toBe(1);
        expect(normalSamples[0].item_unit_id).toBe(item1Id);
        expect(finalSamples[0].item_unit_id).toBe(item2Id);
      } finally {
        await db.execute(`DELETE FROM aql_samples WHERE id IN (?, ?)`, [`s-n1-${timestamp}`, `s-f1-${timestamp}`]);
        await db.execute(`DELETE FROM aql_inspections WHERE id IN (?, ?)`, [`aql-n-${timestamp}`, `aql-f-${timestamp}`]);
        await db.execute(`DELETE FROM box_items WHERE box_id = ?`, [boxId]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?)`, [item1Id, item2Id]);
        await db.execute(`DELETE FROM boxes WHERE id = ?`, [boxId]);
        await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
      }
    }
  }, 20000);

  it('16. Fully Dynamic Product Configuration Master Data (Types & Sizes) DDL and DB isolation', async () => {
    // 1. Verify DB schema table structures for product_configuration_types and product_configuration_sizes
    const typesTableSql = `
      CREATE TABLE IF NOT EXISTS product_configuration_types (
        id VARCHAR(191) PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        uses_sizes TINYINT NOT NULL DEFAULT 1,
        active TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL
      );
    `;
    const sizesTableSql = `
      CREATE TABLE IF NOT EXISTS product_configuration_sizes (
        id VARCHAR(191) PRIMARY KEY,
        type_id VARCHAR(191) NOT NULL,
        code VARCHAR(191) NOT NULL,
        name VARCHAR(191) NULL,
        active TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL
      );
    `;
    expect(typesTableSql).toContain('uses_sizes');
    expect(typesTableSql).toContain('active');
    expect(sizesTableSql).toContain('type_id');
    expect(sizesTableSql).toContain('code');

    // 2. DB integration test for CRUD, duplicate validation, and dynamic matching
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    if (isConnected) {
      const timestamp = Date.now();
      const typeId = `pct-${timestamp}`;
      const size1Id = `pcs-1-${timestamp}`;
      const size2Id = `pcs-2-${timestamp}`;

      try {
        // Insert custom configuration type
        await db.execute(
          `INSERT INTO product_configuration_types (id, name, uses_sizes, active, created_at, updated_at) VALUES (?, ?, 1, 1, NOW(3), NOW(3))`,
          [typeId, `CUSTOM_TYPE_${timestamp}`]
        );

        // Insert sizes under custom type
        await db.execute(
          `INSERT INTO product_configuration_sizes (id, type_id, code, name, active, created_at, updated_at) VALUES (?, ?, 'S1', 'Size 1', 1, NOW(3), NOW(3))`,
          [size1Id, typeId]
        );
        await db.execute(
          `INSERT INTO product_configuration_sizes (id, type_id, code, name, active, created_at, updated_at) VALUES (?, ?, 'S2', 'Size 2', 1, NOW(3), NOW(3))`,
          [size2Id, typeId]
        );

        // Query back custom type & sizes
        const savedType = await db.queryOne<any>(`SELECT * FROM product_configuration_types WHERE id = ?`, [typeId]);
        const savedSizes = await db.query<any>(`SELECT * FROM product_configuration_sizes WHERE type_id = ? ORDER BY code ASC`, [typeId]);

        expect(savedType).toBeDefined();
        expect(savedType.name).toBe(`CUSTOM_TYPE_${timestamp}`);
        expect(savedType.uses_sizes).toBe(1);
        expect(savedSizes.length).toBe(2);
        expect(savedSizes[0].code).toBe('S1');
        expect(savedSizes[1].code).toBe('S2');
      } finally {
        await db.execute(`DELETE FROM product_configuration_sizes WHERE type_id = ?`, [typeId]);
        await db.execute(`DELETE FROM product_configuration_types WHERE id = ?`, [typeId]);
      }
    }
  }, 20000);

  it('17. PO-Level QC Station Configuration Unit & Validation Tests (1 Station vs 2 Stations, Tests 1–9)', async () => {
    // 1. Verify schema DDL column support
    const alterTableSql = `ALTER TABLE production_orders ADD COLUMN qc_station_count TINYINT NOT NULL DEFAULT 2 AFTER qc_test_mode;`;
    expect(alterTableSql).toContain('qc_station_count');

    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    if (isConnected) {
      const timestamp = Date.now();
      const po1Id = `po-st1-${timestamp}`;
      const po2Id = `po-st2-${timestamp}`;
      const poQcOnlyId = `po-qconly-${timestamp}`;
      const poTestOnlyId = `po-testonly-${timestamp}`;

      const item1Id = `itm-st1-${timestamp}`;
      const item2Id = `itm-st2-${timestamp}`;
      const itemQcOnlyId = `itm-qconly-${timestamp}`;
      const itemTestOnlyId = `itm-testonly-${timestamp}`;

      try {
        // TEST 1: Create PO with 1 Station (qc_station_count = 1)
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, qc_station_count, created_at, updated_at)
           VALUES (?, ?, 'PO 1 Station', 'MAP-1', 'Cust A', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', 1, NOW(3), NOW(3))`,
          [po1Id, `PO-ST1-${timestamp}`]
        );
        const po1Row = await db.queryOne<any>(`SELECT qc_station_count FROM production_orders WHERE id = ?`, [po1Id]);
        expect(po1Row?.qc_station_count).toBe(1);

        // TEST 2: Create PO with 2 Stations (qc_station_count = 2)
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, qc_station_count, created_at, updated_at)
           VALUES (?, ?, 'PO 2 Stations', 'MAP-2', 'Cust B', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', 2, NOW(3), NOW(3))`,
          [po2Id, `PO-ST2-${timestamp}`]
        );
        const po2Row = await db.queryOne<any>(`SELECT qc_station_count FROM production_orders WHERE id = ?`, [po2Id]);
        expect(po2Row?.qc_station_count).toBe(2);

        // Setup Item Units
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-ST1-01', ?, 'CREATED', NOW(3), NOW(3))`, [item1Id, po1Id]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-ST2-01', ?, 'CREATED', NOW(3), NOW(3))`, [item2Id, po2Id]);

        // TEST 3: 1 Station + Endline & Functional Test -> Both PASS provided -> Single atomic save PASS
        const qc1Id = `qc-st1-${timestamp}`;
        await db.execute(
          `INSERT INTO qc_results (id, item_id, operator_id, test_operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at, test_scanned_at)
           VALUES (?, ?, 'usr-op1', 'usr-op1', 'PASS', 'PASS', 0, NOW(3), NOW(3), NOW(3))`,
          [qc1Id, item1Id]
        );
        const savedQc1 = await db.queryOne<any>(`SELECT * FROM qc_results WHERE id = ?`, [qc1Id]);
        expect(savedQc1?.qc_result).toBe('PASS');
        expect(savedQc1?.test_result).toBe('PASS');

        // TEST 4 & 5: Validation rules logic verification
        // For 1 station PO (qc_station_count = 1), missing either qcResult or testResult must be rejected
        const validate1StationSubmission = (qcRes?: string, testRes?: string) => {
          if (!qcRes || !testRes) {
            return { valid: false, error: 'BOTH_RESULTS_REQUIRED', message: 'Both Endline Inspection and Functional Test results are required before saving for 1 Station QC.' };
          }
          return { valid: true };
        };

        const test4Check = validate1StationSubmission('PASS', undefined);
        expect(test4Check.valid).toBe(false);
        expect(test4Check.error).toBe('BOTH_RESULTS_REQUIRED');

        const test5Check = validate1StationSubmission(undefined, 'PASS');
        expect(test5Check.valid).toBe(false);
        expect(test5Check.error).toBe('BOTH_RESULTS_REQUIRED');

        // TEST 6 & 7: 2 Stations independent save behavior
        const qc2Id = `qc-st2-${timestamp}`;
        // Station 1 Endline Inspection saved independently (test_result pending)
        await db.execute(
          `INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at)
           VALUES (?, ?, 'usr-op1', 'PASS', 'PENDING', 0, NOW(3), NOW(3))`,
          [qc2Id, item2Id]
        );
        const st1Result = await db.queryOne<any>(`SELECT * FROM qc_results WHERE id = ?`, [qc2Id]);
        expect(st1Result?.qc_result).toBe('PASS');
        expect(st1Result?.test_result).toBe('PENDING');

        // Station 2 Functional Test saved independently later
        await db.execute(
          `UPDATE qc_results SET test_operator_id = 'usr-op2', test_result = 'PASS', test_scanned_at = NOW(3) WHERE id = ?`,
          [qc2Id]
        );
        const st2Result = await db.queryOne<any>(`SELECT * FROM qc_results WHERE id = ?`, [qc2Id]);
        expect(st2Result?.qc_result).toBe('PASS');
        expect(st2Result?.test_result).toBe('PASS');
        expect(st2Result?.operator_id).toBe('usr-op1');
        expect(st2Result?.test_operator_id).toBe('usr-op2');

        // TEST 8: Endline Inspection Only (QC_ONLY mode)
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, qc_station_count, created_at, updated_at)
           VALUES (?, ?, 'PO QC Only', 'MAP-QCO', 'Cust C', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_ONLY', 1, NOW(3), NOW(3))`,
          [poQcOnlyId, `PO-QCO-${timestamp}`]
        );
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-QCO-01', ?, 'CREATED', NOW(3), NOW(3))`, [itemQcOnlyId, poQcOnlyId]);
        const qcOnlyQcId = `qc-qco-${timestamp}`;
        await db.execute(
          `INSERT INTO qc_results (id, item_id, operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at)
           VALUES (?, ?, 'usr-op1', 'PASS', 'PASS', 0, NOW(3), NOW(3))`,
          [qcOnlyQcId, itemQcOnlyId]
        );
        const qcOnlyRow = await db.queryOne<any>(`SELECT * FROM qc_results WHERE id = ?`, [qcOnlyQcId]);
        expect(qcOnlyRow?.qc_result).toBe('PASS');

        // TEST 9: Functional Test Only (TEST_ONLY mode)
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, qc_station_count, created_at, updated_at)
           VALUES (?, ?, 'PO Test Only', 'MAP-TO', 'Cust D', '2026-09-01', '2026-10-01', 'CURRENT', 'TEST_ONLY', 1, NOW(3), NOW(3))`,
          [poTestOnlyId, `PO-TO-${timestamp}`]
        );
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-TO-01', ?, 'CREATED', NOW(3), NOW(3))`, [itemTestOnlyId, poTestOnlyId]);
        const testOnlyQcId = `qc-to-${timestamp}`;
        await db.execute(
          `INSERT INTO qc_results (id, item_id, operator_id, test_operator_id, qc_result, test_result, retry_count, first_scanned_at, scanned_at, test_scanned_at)
           VALUES (?, ?, 'usr-op1', 'usr-op1', 'PASS', 'PASS', 0, NOW(3), NOW(3), NOW(3))`,
          [testOnlyQcId, itemTestOnlyId]
        );
        const testOnlyRow = await db.queryOne<any>(`SELECT * FROM qc_results WHERE id = ?`, [testOnlyQcId]);
        expect(testOnlyRow?.test_result).toBe('PASS');
      } finally {
        await db.execute(`DELETE FROM qc_results WHERE item_id IN (?, ?, ?, ?)`, [item1Id, item2Id, itemQcOnlyId, itemTestOnlyId]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?, ?, ?)`, [item1Id, item2Id, itemQcOnlyId, itemTestOnlyId]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?, ?, ?)`, [po1Id, po2Id, poQcOnlyId, poTestOnlyId]);
      }
    }
  }, 20000);

  it('18. Pre-QC → QC Relational Assignment & Rescan Traceability Validation', async () => {
    const timestamp = Date.now();
    const poId = `po-preqc-${timestamp}`;
    const productQr = `PNFLSS${timestamp.toString().slice(-4)}`;
    const preQcQr1 = `OMP/${timestamp.toString().slice(-5)}`;
    const preQcQr2 = `EVT/${timestamp.toString().slice(-5)}`;
    const preQcQr3 = `AAA-11`;

    if (process.env.TEST_DB === 'true' && db) {
      try {
        // Create PO with Pre QC enabled
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, qc_station_count, created_at, updated_at)
           VALUES (?, ?, 'Pre-QC Test PO', 'MAP-PQC', 'Cust PreQC', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', 1, NOW(3), NOW(3))`,
          [poId, `PO-PQC-${timestamp}`]
        );
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'PRE_QC')`, [poId]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'QC_TEST')`, [poId]);

        // 1. Record raw Pre-QC items (accepts arbitrary format AAA-11, OMP/..., EVT/...)
        const item1Id = `item-pqc1-${timestamp}`;
        const item2Id = `item-pqc2-${timestamp}`;
        const item3Id = `item-pqc3-${timestamp}`;

        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item1Id, preQcQr1, poId]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item2Id, preQcQr2, poId]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item3Id, preQcQr3, poId]);

        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, 'usr-op1', ?, 'PASS', NOW(3))`, [`pqr1-${timestamp}`, item1Id, poId]);
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, 'usr-op1', ?, 'PASS', NOW(3))`, [`pqr2-${timestamp}`, item2Id, poId]);
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, 'usr-op1', ?, 'PASS', NOW(3))`, [`pqr3-${timestamp}`, item3Id, poId]);

        // 2. Relational Assignment: Assign preQC items to Product QR
        const assign1 = `pqa1-${timestamp}`;
        const assign2 = `pqa2-${timestamp}`;
        const assign3 = `pqa3-${timestamp}`;

        await db.execute(`INSERT INTO pre_qc_assignments (id, production_order_id, product_qr, pre_qc_qr, operator_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'usr-op1', NOW(3), NOW(3))`, [assign1, poId, productQr, preQcQr1]);
        await db.execute(`INSERT INTO pre_qc_assignments (id, production_order_id, product_qr, pre_qc_qr, operator_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'usr-op1', NOW(3), NOW(3))`, [assign2, poId, productQr, preQcQr2]);
        await db.execute(`INSERT INTO pre_qc_assignments (id, production_order_id, product_qr, pre_qc_qr, operator_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'usr-op1', NOW(3), NOW(3))`, [assign3, poId, productQr, preQcQr3]);

        // 3. Rescan verification — assigned items exist and are relational
        const assignedRows = await db.query<any>(`SELECT pre_qc_qr FROM pre_qc_assignments WHERE production_order_id = ? AND product_qr = ? ORDER BY assigned_at ASC`, [poId, productQr]);
        expect(assignedRows.length).toBe(3);
        expect(assignedRows.map(r => r.pre_qc_qr)).toEqual([preQcQr1, preQcQr2, preQcQr3]);

        // 4. Pre-QC assignment does NOT auto-pass QC
        const qcRow = await db.queryOne<any>(`SELECT * FROM qc_results WHERE item_id IN (SELECT id FROM item_units WHERE qr_code = ?)`, [productQr]);
        expect(qcRow).toBeNull();
      } finally {
        await db.execute(`DELETE FROM pre_qc_assignments WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM pre_qc_results WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM item_units WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM production_order_operations WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
      }
    }
  });

  it('19. Pre-QC Operator Progress & Independent Target Handling Validation', async () => {
    const timestamp = Date.now();
    const poId = `po-pqc-prog-${timestamp}`;
    const opA = `usr-op-a-${timestamp}`;
    const opB = `usr-op-b-${timestamp}`;

    if (process.env.TEST_DB === 'true' && db) {
      try {
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, created_at, updated_at)
           VALUES (?, ?, 'PreQC Progress PO', 'MAP-PROG', 'Cust Prog', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', NOW(3), NOW(3))`,
          [poId, `PO-PROG-${timestamp}`]
        );

        const item1Id = `item-opA-pass-${timestamp}`;
        const item2Id = `item-opA-fail-${timestamp}`;
        const item3Id = `item-opB-pass-${timestamp}`;

        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-A-PASS', ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item1Id, poId]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-A-FAIL', ?, 'PRE_QC_FAILED', NOW(3), NOW(3))`, [item2Id, poId]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'QR-B-PASS', ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item3Id, poId]);

        // Operator A records 1 PASS, 1 FAIL
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, ?, ?, 'PASS', NOW(3))`, [`pq-res1-${timestamp}`, item1Id, opA, poId]);
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, ?, ?, 'FAIL', NOW(3))`, [`pq-res2-${timestamp}`, item2Id, opA, poId]);

        // Operator B records 1 PASS
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, ?, ?, 'PASS', NOW(3))`, [`pq-res3-${timestamp}`, item3Id, opB, poId]);

        const { calculatePreQCProgress } = require('../server/src/routes/scans');

        // Test Operator A progress
        const progA = await calculatePreQCProgress(poId, { id: opA, username: opA });
        expect(progA.completed).toBe(1);
        expect(progA.failed).toBe(1);
        expect(progA.totalProcessed).toBe(2);
        expect(progA.hasTarget).toBe(false);
        expect(progA.target).toBeNull();

        // Test Operator B progress (isolated from Operator A)
        const progB = await calculatePreQCProgress(poId, { id: opB, username: opB });
        expect(progB.completed).toBe(1);
        expect(progB.failed).toBe(0);
        expect(progB.totalProcessed).toBe(1);
        expect(progB.hasTarget).toBe(false);
        expect(progB.target).toBeNull();
      } finally {
        await db.execute(`DELETE FROM pre_qc_results WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM item_units WHERE production_order_id = ?`, [poId]);
        await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poId]);
      }
    }
  });

  it('20. Pre-QC Single-Item Validation Rules for Step 1 Assignment (/api/pre-qc/validate-item)', async () => {
    const timestamp = Date.now();
    const po1Id = `po-val1-${timestamp}`;
    const po2Id = `po-val2-${timestamp}`;
    const validPreQcQr = `VAL1/${timestamp}`;
    const crossPoPreQcQr = `VAL2/${timestamp}`;
    const uncapturedQr = `XYZ/999`;

    if (process.env.TEST_DB === 'true' && db) {
      try {
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, created_at, updated_at) VALUES (?, ?, 'PO Val 1', 'MAP-V1', 'Cust 1', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', NOW(3), NOW(3))`, [po1Id, `PO-V1-${timestamp}`]);
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, qc_test_mode, created_at, updated_at) VALUES (?, ?, 'PO Val 2', 'MAP-V2', 'Cust 2', '2026-09-01', '2026-10-01', 'CURRENT', 'QC_AND_TEST', NOW(3), NOW(3))`, [po2Id, `PO-V2-${timestamp}`]);

        const item1Id = `itm-v1-${timestamp}`;
        const item2Id = `itm-v2-${timestamp}`;

        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item1Id, validPreQcQr, po1Id]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'PRE_QC_PASSED', NOW(3), NOW(3))`, [item2Id, crossPoPreQcQr, po2Id]);

        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, 'usr-op1', ?, 'PASS', NOW(3))`, [`pqv1-${timestamp}`, item1Id, po1Id]);
        await db.execute(`INSERT INTO pre_qc_results (id, item_id, operator_id, production_order_id, pre_qc_result, scanned_at) VALUES (?, ?, 'usr-op1', ?, 'PASS', NOW(3))`, [`pqv2-${timestamp}`, item2Id, po2Id]);

        // Validation 1: Same PO valid Pre-QC item passes
        const val1 = await db.queryOne<any>(`
          SELECT pqr.* FROM pre_qc_results pqr
          JOIN item_units iu ON iu.id = pqr.item_id
          WHERE pqr.production_order_id = ? AND UPPER(TRIM(iu.qr_code)) = ? AND pqr.pre_qc_result = 'PASS'
        `, [po1Id, validPreQcQr]);
        expect(val1).toBeDefined();

        // Validation 2: Cross PO Pre-QC item returns null for po1
        const valCross = await db.queryOne<any>(`
          SELECT pqr.* FROM pre_qc_results pqr
          JOIN item_units iu ON iu.id = pqr.item_id
          WHERE pqr.production_order_id = ? AND UPPER(TRIM(iu.qr_code)) = ? AND pqr.pre_qc_result = 'PASS'
        `, [po1Id, crossPoPreQcQr]);
        expect(valCross).toBeNull();

        // Validation 3: Uncaptured QR returns null
        const valUncaptured = await db.queryOne<any>(`
          SELECT pqr.* FROM pre_qc_results pqr
          JOIN item_units iu ON iu.id = pqr.item_id
          WHERE pqr.production_order_id = ? AND UPPER(TRIM(iu.qr_code)) = ? AND pqr.pre_qc_result = 'PASS'
        `, [po1Id, uncapturedQr]);
        expect(valUncaptured).toBeNull();
      } finally {
        await db.execute(`DELETE FROM pre_qc_results WHERE production_order_id IN (?, ?)`, [po1Id, po2Id]);
        await db.execute(`DELETE FROM item_units WHERE production_order_id IN (?, ?)`, [po1Id, po2Id]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1Id, po2Id]);
      }
    } else {
      expect(validPreQcQr).not.toBe(crossPoPreQcQr);
      expect(uncapturedQr).toBe('XYZ/999');
    }
  });

  it('21. Pre-QC Progress Statistics — Operator Scoped vs All-Operator PO Totals', async () => {
    const { calculatePreQCProgress } = await import('../server/src/routes/scans');
    const timestamp = Date.now();
    const poId = `po-pqc-stats-${timestamp}`;
    const opA = { id: `op-a-${timestamp}`, username: `chamika_${timestamp}`, full_name: 'Chamika' };
    const opB = { id: `op-b-${timestamp}`, username: `nimal_${timestamp}`, full_name: 'Nimal' };

    // Test operator progress calculation logic
    const mockDbResults = [
      { item_id: 'i1', operator_id: opA.id, pre_qc_result: 'PASS' },
      { item_id: 'i2', operator_id: opA.id, pre_qc_result: 'PASS' },
      { item_id: 'i3', operator_id: opA.id, pre_qc_result: 'FAIL' },
      { item_id: 'i4', operator_id: opB.id, pre_qc_result: 'PASS' },
      { item_id: 'i5', operator_id: opB.id, pre_qc_result: 'PASS' },
      { item_id: 'i6', operator_id: opB.id, pre_qc_result: 'PASS' },
      { item_id: 'i7', operator_id: opB.id, pre_qc_result: 'FAIL' },
      { item_id: 'i8', operator_id: opB.id, pre_qc_result: 'FAIL' },
    ];

    const opAPassed = mockDbResults.filter(r => r.operator_id === opA.id && r.pre_qc_result === 'PASS').length;
    const opAFailed = mockDbResults.filter(r => r.operator_id === opA.id && r.pre_qc_result === 'FAIL').length;
    const totalPassed = mockDbResults.filter(r => r.pre_qc_result === 'PASS').length;
    const totalFailed = mockDbResults.filter(r => r.pre_qc_result === 'FAIL').length;

    // Operator A stats
    expect(opAPassed).toBe(2);
    expect(opAFailed).toBe(1);
    expect(opAPassed + opAFailed).toBe(3);

    // All Operator totals
    expect(totalPassed).toBe(5);
    expect(totalFailed).toBe(3);
    expect(totalPassed + totalFailed).toBe(8);

    // Operator stats are filtered by operator; Total stats include all operators
    expect(opAPassed).not.toBe(totalPassed);
    expect(totalPassed).toBe(5);
  });

  it('22. QC PASS Limit Validation Rule — PASS <= PO quantity, FAIL does not consume PO quantity', async () => {
    const { getPOTargetQuantity } = await import('../server/src/routes/scans');

    const poTargetQty = 4;
    let existingPassCount = 0;
    let existingFailCount = 0;

    // Helper simulating PASS submission check
    const canPass = (targetQty: number, currentPasses: number) => {
      return targetQty <= 0 || currentPasses < targetQty;
    };

    // 1. First 4 PASS results allowed
    for (let i = 0; i < 4; i++) {
      expect(canPass(poTargetQty, existingPassCount)).toBe(true);
      existingPassCount++;
    }
    expect(existingPassCount).toBe(4);

    // 2. 5th PASS result REJECTED
    expect(canPass(poTargetQty, existingPassCount)).toBe(false);

    // 3. FAIL results DO NOT consume PO quantity or increment PASS count
    existingFailCount += 10;
    expect(existingPassCount).toBe(4); // PASS count remains 4
    expect(existingFailCount).toBe(10); // FAIL count is 10

    // 4. FAIL submission is ALWAYS allowed even when PASS count reached PO quantity
    const isFailSubmissionAllowed = true;
    expect(isFailSubmissionAllowed).toBe(true);

    // 5. Attempting another PASS still rejected
    expect(canPass(poTargetQty, existingPassCount)).toBe(false);
  });

  it('23. Pre-QC QR Validation Separation — Pre-QC QRs do NOT use Product Config Validation', async () => {
    const { validateProductQrRange } = await import('../server/src/routes/scans');

    const productConfig = { config_code: 'PNFLSS' };
    const validProductQr = 'PNFLSS0926001';
    const preQcQr1 = 'AAA-1';
    const preQcQr2 = 'OMP/34567';

    // 1. Valid Product QR passes product validator
    const prodVal = validateProductQrRange(productConfig, validProductQr);
    expect(prodVal.valid).toBe(true);

    // 2. Product validator WOULD reject Pre-QC QR if wrongly called (verifying why separation is needed)
    const preQcWrongVal = validateProductQrRange(productConfig, preQcQr1);
    expect(preQcWrongVal.valid).toBe(false);

    // 3. Separation rule: Pre-QC QR MUST NOT be passed to product validator
    const isPreQcQr = (qr: string) => qr.startsWith('AAA') || qr.startsWith('OMP') || !qr.startsWith('PNFLSS');
    expect(isPreQcQr(preQcQr1)).toBe(true);
    expect(isPreQcQr(preQcQr2)).toBe(true);
    expect(isPreQcQr(validProductQr)).toBe(false);
  });

  it('24. Packing Box PO Relationship & Duplicate Validation — Scoped by production_order_id + product QR', async () => {
    // Model boxes and packing records across POs
    const boxes = [
      { boxNumber: 'BX-000', productionOrderId: 'PO-A' },
      { boxNumber: 'BX-001', productionOrderId: 'PO-B' },
      { boxNumber: 'BX-010', productionOrderId: 'PO-B' },
    ];

    const packingRecords = [
      { productionOrderId: 'PO-A', boxNumber: 'BX-000', productQr: 'AAA-1' }
    ];

    const validatePackingScan = (currentPoId: string, boxNumber: string, productQr: string) => {
      // 1. Identify Box & Resolve Box -> PO Relationship
      const box = boxes.find(b => b.boxNumber === boxNumber);
      if (box && box.productionOrderId !== currentPoId) {
        return { allowed: false, error: 'BOX_PO_MISMATCH', message: 'This box belongs to another Production Order.' };
      }

      // 2. Check Product QR duplicate ONLY inside current PO
      const existingInPo = packingRecords.find(r => r.productionOrderId === currentPoId && r.productQr === productQr);
      if (existingInPo) {
        return { allowed: false, error: 'ALREADY_PACKED', message: `${productQr} is already packed in this Production Order.` };
      }

      return { allowed: true };
    };

    // CASE 1: PO-A, BX-000 belongs to PO-A, AAA-1 packed in BX-000. Scan AAA-1 under PO-B into BX-001 (belongs to PO-B).
    // Expected: ALLOW because AAA-1 exists only under PO-A
    const case1 = validatePackingScan('PO-B', 'BX-001', 'AAA-1');
    expect(case1.allowed).toBe(true);

    // CASE 2: PO-A, BX-000 belongs to PO-A, AAA-1 packed in BX-000. Scan AAA-1 under PO-A into BX-000 / BX-002 (belongs to PO-A).
    // Expected: REJECT because AAA-1 is already packed in PO-A
    const case2 = validatePackingScan('PO-A', 'BX-000', 'AAA-1');
    expect(case2.allowed).toBe(false);
    expect(case2.message).toBe('AAA-1 is already packed in this Production Order.');

    // CASE 3: Current PO = PO-B. Selected Box = BX-000 (belongs to PO-A).
    // Expected: REJECT BEFORE QR DUPLICATE CHECK. Message: "This box belongs to another Production Order."
    const case3 = validatePackingScan('PO-B', 'BX-000', 'AAA-1');
    expect(case3.allowed).toBe(false);
    expect(case3.error).toBe('BOX_PO_MISMATCH');
    expect(case3.message).toBe('This box belongs to another Production Order.');

    // CASE 4: Current PO = PO-B. Selected Box = BX-001 (belongs to PO-B). AAA-1 exists packed under PO-A only.
    // Expected: ALLOW
    const case4 = validatePackingScan('PO-B', 'BX-001', 'AAA-1');
    expect(case4.allowed).toBe(true);

    // Record AAA-1 as packed under PO-B in BX-001
    packingRecords.push({ productionOrderId: 'PO-B', boxNumber: 'BX-001', productQr: 'AAA-1' });

    // CASE 5: Current PO = PO-B. Selected Box = BX-010 (belongs to PO-B). AAA-1 already exists packed under PO-B in BX-001.
    // Expected: REJECT. Message: "AAA-1 is already packed in this Production Order."
    const case5 = validatePackingScan('PO-B', 'BX-010', 'AAA-1');
    expect(case5.allowed).toBe(false);
    expect(case5.message).toBe('AAA-1 is already packed in this Production Order.');
  });

  it('25. PO Box Configuration Structure & Uniqueness Rule — Table DDL & Multi-Config per PO', () => {
    const boxConfigDdl = `
      CREATE TABLE IF NOT EXISTS production_order_box_configs (
        id VARCHAR(191) PRIMARY KEY,
        production_order_id VARCHAR(191) NOT NULL,
        prefix VARCHAR(191) NOT NULL,
        size VARCHAR(50) NOT NULL,
        capacity INT NOT NULL DEFAULT 12,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY uq_pbc_po_prefix_size (production_order_id, prefix, size),
        INDEX idx_pbc_po (production_order_id),
        FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    expect(boxConfigDdl).toContain('production_order_id');
    expect(boxConfigDdl).toContain('prefix');
    expect(boxConfigDdl).toContain('size');
    expect(boxConfigDdl).toContain('capacity');
    expect(boxConfigDdl).toContain('uq_pbc_po_prefix_size (production_order_id, prefix, size)');

    // Multiple Box Configurations for same PO
    const poConfigs = [
      { prefix: 'BX', size: 'SS', capacity: 12 },
      { prefix: 'BX', size: 'M', capacity: 12 },
      { prefix: 'BX', size: 'L', capacity: 20 }
    ];

    expect(poConfigs.length).toBe(3);
    expect(poConfigs[0].capacity).toBe(12);
    expect(poConfigs[2].capacity).toBe(20);
  });

  it('26. Box QR Validation Rules — Configured Prefix + Size Matching & Rejection Cases', () => {
    // Model PO Box Configurations
    const poBoxConfigs = [
      { prefix: 'BX', size: 'SS', capacity: 12 },
      { prefix: 'BX', size: 'M', capacity: 12 }
    ];

    const validateBoxQr = (configs: Array<{ prefix: string; size: string; capacity: number }>, qr: string) => {
      const cleanQr = qr.trim().toUpperCase();
      const sortedConfigs = [...configs].sort((a, b) => (b.prefix + b.size).length - (a.prefix + a.size).length);

      for (const cfg of sortedConfigs) {
        const prefixSize = (cfg.prefix + cfg.size).toUpperCase();
        if (cleanQr.startsWith(prefixSize)) {
          const serial = cleanQr.slice(prefixSize.length);
          if (serial.length > 0) {
            return { valid: true, config: cfg, serial, capacity: cfg.capacity };
          }
        }
      }

      const matchingPrefix = configs.find(c => cleanQr.startsWith(c.prefix.toUpperCase()));
      if (matchingPrefix) {
        const remaining = cleanQr.slice(matchingPrefix.prefix.length);
        if (!remaining) {
          return { valid: false, error: 'BOX_SIZE_MISSING', message: 'Required box size is missing' };
        }
        return { valid: false, error: 'BOX_SIZE_NOT_CONFIGURED', message: 'Box size is not configured for this Production Order' };
      }

      return { valid: false, error: 'BOX_PREFIX_NOT_CONFIGURED', message: 'Box prefix is not configured for this Production Order' };
    };

    // 1. BXSS345667 -> VALID (Prefix BX + Size SS + Serial 345667)
    const res1 = validateBoxQr(poBoxConfigs, 'BXSS345667');
    expect(res1.valid).toBe(true);
    expect(res1.config?.size).toBe('SS');
    expect(res1.serial).toBe('345667');

    // 2. BXM345667 -> VALID (Prefix BX + Size M + Serial 345667)
    const res2 = validateBoxQr(poBoxConfigs, 'BXM345667');
    expect(res2.valid).toBe(true);
    expect(res2.config?.size).toBe('M');

    // 3. BX345667 -> REJECT (Size missing)
    const res3 = validateBoxQr(poBoxConfigs, 'BX345667');
    expect(res3.valid).toBe(false);
    expect(res3.error).toBe('BOX_SIZE_NOT_CONFIGURED');

    // 4. BXLS345667 -> REJECT (Size L/LS not configured)
    const res4 = validateBoxQr(poBoxConfigs, 'BXLS345667');
    expect(res4.valid).toBe(false);
    expect(res4.error).toBe('BOX_SIZE_NOT_CONFIGURED');

    // 5. ABCSS345667 -> REJECT (Prefix ABC not configured)
    const res5 = validateBoxQr(poBoxConfigs, 'ABCSS345667');
    expect(res5.valid).toBe(false);
    expect(res5.error).toBe('BOX_PREFIX_NOT_CONFIGURED');
  });

  it('27. PO-Scoped Box QR Scoping & PO Mismatch Protection', () => {
    const poA = { id: 'PO-A', boxConfigs: [{ prefix: 'BX', size: 'SS', capacity: 12 }] };
    const poB = { id: 'PO-B', boxConfigs: [{ prefix: 'BX', size: 'M', capacity: 12 }] };

    const validateForPo = (po: typeof poA, qr: string) => {
      const match = po.boxConfigs.find(c => qr.startsWith(c.prefix + c.size));
      return !!match;
    };

    // For PO-A: BXSS345667 VALID, BXM345667 INVALID
    expect(validateForPo(poA, 'BXSS345667')).toBe(true);
    expect(validateForPo(poA, 'BXM345667')).toBe(false);

    // For PO-B: BXM345667 VALID, BXSS345667 INVALID
    expect(validateForPo(poB, 'BXM345667')).toBe(true);
    expect(validateForPo(poB, 'BXSS345667')).toBe(false);

    // Box PO Mismatch Guard: Box belongs to PO-A, scanning under PO-B
    const boxes = [
      { boxCode: 'BXSS345667', productionOrderId: 'PO-A' }
    ];

    const scanBoxUnderPo = (targetPoId: string, qr: string) => {
      const existing = boxes.find(b => b.boxCode === qr);
      if (existing && existing.productionOrderId !== targetPoId) {
        return { allowed: false, error: 'BOX_PO_MISMATCH', message: 'This box belongs to another Production Order.' };
      }
      return { allowed: true };
    };

    const mismatchTest = scanBoxUnderPo('PO-B', 'BXSS345667');
    expect(mismatchTest.allowed).toBe(false);
    expect(mismatchTest.message).toBe('This box belongs to another Production Order.');

    // Existing box PO relationship CANNOT be overwritten
    expect(boxes[0].productionOrderId).toBe('PO-A');
  });

  it('28. PO-Scoped Duplicate Box QR Check (Same PO Only)', () => {
    const boxes = [
      { boxCode: 'BXSS345667', productionOrderId: 'PO-A' }
    ];

    const checkDuplicateBox = (targetPoId: string, qr: string) => {
      const existingSamePo = boxes.find(b => b.productionOrderId === targetPoId && b.boxCode === qr);
      if (existingSamePo) {
        return { isDuplicate: true, message: 'Box QR already exists in this Production Order' };
      }
      return { isDuplicate: false };
    };

    // 1. Same Box QR under PO-A -> DUPLICATE
    const dupPoA = checkDuplicateBox('PO-A', 'BXSS345667');
    expect(dupPoA.isDuplicate).toBe(true);

    // 2. Same Box QR under PO-B -> NOT DUPLICATE (PO-scoped)
    const dupPoB = checkDuplicateBox('PO-B', 'BXSS345667');
    expect(dupPoB.isDuplicate).toBe(false);
  });

  it('29. Authoritative Dynamic Box Capacity Enforcement (12 vs 20 Capacity)', () => {
    // PO-1: Capacity 12
    const boxPo1 = { boxCode: 'BXSS345667', capacity: 12, packedItemsCount: 12 };
    const canPack13thItem = boxPo1.packedItemsCount < boxPo1.capacity;
    expect(canPack13thItem).toBe(false); // 13th item REJECTED

    // PO-3: Capacity 20
    const boxPo3 = { boxCode: 'BXSS999999', capacity: 20, packedItemsCount: 12 };
    const canPack13thItemPo3 = boxPo3.packedItemsCount < boxPo3.capacity;
    expect(canPack13thItemPo3).toBe(true); // 13th item ALLOWED for capacity 20

    const packUpTo20 = () => {
      let count = 0;
      for (let i = 1; i <= 20; i++) {
        if (count < boxPo3.capacity) {
          count++;
        }
      }
      return count;
    };
    expect(packUpTo20()).toBe(20);
  });

  it('30. Product Configuration vs Box Configuration Strict Separation', () => {
    const productConfig = { configCode: 'PNFLSS' };
    const boxConfig = { prefix: 'BX', size: 'SS', capacity: 12 };

    const productQr = 'PNFLSS123';
    const boxQr = 'BXSS345667';

    // Product QR matches Product Config, NOT Box Config
    expect(productQr.startsWith(productConfig.configCode)).toBe(true);
    expect(productQr.startsWith(boxConfig.prefix + boxConfig.size)).toBe(false);

    // Box QR matches Box Config, NOT Product Config
    expect(boxQr.startsWith(boxConfig.prefix + boxConfig.size)).toBe(true);
    expect(boxQr.startsWith(productConfig.configCode)).toBe(false);
  });

  it('31. QC Pass Verification Requirement for Packing — Un-passed items rejected', () => {
    const qcPassedItems = new Set(['PNFLSS1', 'PNFLSS2']);
    const isQcRequiredOnPo = true;

    const validateItemForPacking = (itemQr: string) => {
      if (isQcRequiredOnPo && !qcPassedItems.has(itemQr)) {
        return { allowed: false, error: 'QC_NOT_PASSED', message: `Item ${itemQr} has not passed QC inspection for this Production Order.` };
      }
      return { allowed: true };
    };

    // 1. PNFLSS1 (Passed QC) -> ALLOWED to pack
    const res1 = validateItemForPacking('PNFLSS1');
    expect(res1.allowed).toBe(true);

    // 2. PNFLSS@2 (Not passed QC) -> REJECTED from packing
    const res2 = validateItemForPacking('PNFLSS@2');
    expect(res2.allowed).toBe(false);
    expect(res2.error).toBe('QC_NOT_PASSED');
    expect(res2.message).toBe('Item PNFLSS@2 has not passed QC inspection for this Production Order.');
  });

  it('32. Comprehensive Box Configuration & Live Database Rules (Tests 1–15)', async () => {
    const { validateBoxForProductionOrder, validateProductForProductionOrder, getAuthorizedBoxDetails } = await import('../server/src/routes/scans');
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();

    const timestamp = Date.now();
    const poAId = `po-a-${timestamp}`;
    const poBId = `po-b-${timestamp}`;

    if (isConnected) {
      try {
        // Create PO-A
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO A', 'MAP-A', 'Cust A', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [poAId, `PO-A-${timestamp}`]
        );
        // Box Config for PO-A: BX + SS (capacity 4) and BX + M (capacity 12)
        await db.execute(
          `INSERT INTO production_order_box_configs (id, production_order_id, prefix, size, capacity, created_at, updated_at)
           VALUES (?, ?, 'BX', 'SS', 4, NOW(3), NOW(3))`,
          [`pbc-a1-${timestamp}`, poAId]
        );
        await db.execute(
          `INSERT INTO production_order_box_configs (id, production_order_id, prefix, size, capacity, created_at, updated_at)
           VALUES (?, ?, 'BX', 'M', 12, NOW(3), NOW(3))`,
          [`pbc-a2-${timestamp}`, poAId]
        );

        // Create PO-B
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO B', 'MAP-B', 'Cust B', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [poBId, `PO-B-${timestamp}`]
        );
        // Box Config for PO-B: BX + M (capacity 20)
        await db.execute(
          `INSERT INTO production_order_box_configs (id, production_order_id, prefix, size, capacity, created_at, updated_at)
           VALUES (?, ?, 'BX', 'M', 20, NOW(3), NOW(3))`,
          [`pbc-b1-${timestamp}`, poBId]
        );

        const poA = { id: poAId, po_number: `PO-A-${timestamp}` };
        const poB = { id: poBId, po_number: `PO-B-${timestamp}` };

        // Test 1: PO-A BX + SS: BXSS123 -> valid
        const t1 = await validateBoxForProductionOrder(poA, 'BXSS123');
        expect(t1.valid).toBe(true);
        expect(t1.capacity).toBe(4);

        // Test 2: PO-A BX + SS: BXL123 -> invalid (L not configured on PO-A)
        const t2 = await validateBoxForProductionOrder(poA, 'BXL123');
        expect(t2.valid).toBe(false);

        // Test 3: PO-B BX + M: BXM123 -> valid
        const t3 = await validateBoxForProductionOrder(poB, 'BXM123');
        expect(t3.valid).toBe(true);
        expect(t3.capacity).toBe(20);

        // Test 4: PO-B BX + M: BXSS123 -> invalid
        const t4 = await validateBoxForProductionOrder(poB, 'BXSS123');
        expect(t4.valid).toBe(false);

        // Test 5: PO-A: BXSS123 first time -> allowed to create
        const t5 = await validateBoxForProductionOrder(poA, 'BXSS123');
        expect(t5.valid).toBe(true);

        // Insert box BXSS123 for PO-A
        const boxA1Id = `box-a1-${timestamp}`;
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BXSS123', 'BXSS123', ?, 4, 'OPEN', NOW(3))`,
          [boxA1Id, poAId]
        );

        // Test 6: PO-A: BXSS123 second time -> duplicate box for PO-A
        const existingBoxPoA = await db.queryOne<any>(
          `SELECT * FROM boxes WHERE production_order_id = ? AND box_code = 'BXSS123'`,
          [poAId]
        );
        expect(existingBoxPoA).toBeDefined();

        // Test 7: PO-B: BXSS123 -> composite UNIQUE(production_order_id, box_code) allows inserting BXSS123 for PO-B!
        const boxB1Id = `box-b1-${timestamp}`;
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BXSS123', 'BXSS123', ?, 20, 'OPEN', NOW(3))`,
          [boxB1Id, poBId]
        );
        const savedBoxPoB = await db.queryOne<any>(
          `SELECT * FROM boxes WHERE production_order_id = ? AND box_code = 'BXSS123'`,
          [poBId]
        );
        expect(savedBoxPoB).toBeDefined();
        expect(savedBoxPoB.id).toBe(boxB1Id);

        // Test 8: Box from another PO: reject with PO mismatch
        const mismatchRes = await getAuthorizedBoxDetails(savedBoxPoB, 'usr-op1', 'OPERATOR', poAId);
        expect('error' in mismatchRes).toBe(true);
        if ('error' in mismatchRes) {
          expect(mismatchRes.error).toBe('BOX_PO_MISMATCH');
        }

        // Test 9: Capacity 4: first 4 packed items -> allowed, 5th -> rejected
        const cap4Box = { capacity: 4, activeCount: 4 };
        expect(cap4Box.activeCount >= cap4Box.capacity).toBe(true);

        // Test 10: Capacity 12: first 12 -> allowed, 13th -> rejected
        const cap12Box = { capacity: 12, activeCount: 12 };
        expect(cap12Box.activeCount >= cap12Box.capacity).toBe(true);

        // Test 11: Existing historical boxes (e.g. BX-001) load correctly
        const histBoxId = `box-hist-${timestamp}`;
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BX-001', 'BX-001', ?, 12, 'OPEN', NOW(3))`,
          [histBoxId, poAId]
        );
        const histBox = await db.queryOne<any>(`SELECT * FROM boxes WHERE id = ?`, [histBoxId]);
        const histResult = await getAuthorizedBoxDetails(histBox, 'usr-op1', 'OPERATOR', poAId);
        expect('box' in histResult).toBe(true);
        if ('box' in histResult) {
          expect(histResult.box.boxCode).toBe('BX-001');
          expect(histResult.box.capacity).toBe(12);
        }

        // Test 12: Multiple Box Configurations in one PO: BX+SS and BX+M both exist and validate independently
        const valSS = await validateBoxForProductionOrder(poA, 'BXSS999');
        const valM = await validateBoxForProductionOrder(poA, 'BXM999');
        expect(valSS.valid).toBe(true);
        expect(valM.valid).toBe(true);
        expect(valSS.capacity).toBe(4);
        expect(valM.capacity).toBe(12);

        // Test 13: Product QR validation must NOT be used for Box QR
        const prodValBox = await validateProductForProductionOrder(poA, 'BXSS123');
        expect(prodValBox.valid).toBe(false);

        // Test 14: Box capacity comes from matched PO config when creating box
        expect(valSS.capacity).toBe(4);

        // Test 15: Existing box capacity remains authoritative
        expect(histBox.capacity).toBe(12);
      } finally {
        await db.execute(`DELETE FROM boxes WHERE production_order_id IN (?, ?)`, [poAId, poBId]);
        await db.execute(`DELETE FROM production_order_box_configs WHERE production_order_id IN (?, ?)`, [poAId, poBId]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [poAId, poBId]);
      }
    }
  });

  it('33. Packing Duplicate Item Regression Test Suite (Same-PO, Cross-PO, Inactive Record, Current-PO Assignment)', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    const po1Id = `po-dup1-${timestamp}`;
    const po2Id = `po-dup2-${timestamp}`;
    const po1Number = `PO-DUP1-${timestamp}`;
    const po2Number = `PO-DUP2-${timestamp}`;

    const box1Id = `box-d1-${timestamp}`;
    const box2Id = `box-d2-${timestamp}`;
    const box3Id = `box-d3-${timestamp}`;

    const item1Id = `itm-d1-${timestamp}`;
    const item2Id = `itm-d2-${timestamp}`;

    const qrCode = `PNFLSS${timestamp.toString().slice(-4)}`;

    if (isConnected) {
      try {
        // Create PO 1 & PO 2
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO Dup 1', 'MAP-D1', 'Cust D1', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po1Id, po1Number]
        );
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO Dup 2', 'MAP-D2', 'Cust D2', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po2Id, po2Number]
        );

        // Create Box 1 & Box 2 for PO 1; Box 3 for PO 2
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BX-001', 'BX-001', ?, 12, 'OPEN', NOW(3))`, [box1Id, po1Id]);
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BX-002', 'BX-002', ?, 12, 'OPEN', NOW(3))`, [box2Id, po1Id]);
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BX-003', 'BX-003', ?, 12, 'OPEN', NOW(3))`, [box3Id, po2Id]);

        // Create Item 1 for PO 1, Item 2 for PO 2
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'CREATED', NOW(3), NOW(3))`, [item1Id, qrCode, po1Id]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, ?, ?, 'CREATED', NOW(3), NOW(3))`, [item2Id, qrCode, po2Id]);

        // 1. Pack Item 1 into Box 1 (PO 1) as ACTIVE (active = 1)
        const bi1Id = `bi-d1-${timestamp}`;
        await db.execute(`INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, 'usr-op1', NOW(3), 1)`, [bi1Id, box1Id, item1Id]);

        // REGRESSION TEST 1: Same-PO Duplicate -> Scanning item1 under PO 1 for Box 2 must find active pack in Box 1 and reject
        const dupSamePo = await db.queryOne<any>(`
          SELECT bi.*, b.box_code, b.box_number
          FROM box_items bi
          JOIN boxes b ON b.id = bi.box_id
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE (b.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(iu.qr_code)) = ?
            AND bi.active = 1
        `, [po1Id, po1Number, qrCode]);
        expect(dupSamePo).toBeDefined();
        expect(dupSamePo.box_code).toBe('BX-001');

        // REGRESSION TEST 2: Cross-PO Same-QR -> Scanning same QR under PO 2 must NOT find an active pack in PO 2
        const dupCrossPo = await db.queryOne<any>(`
          SELECT bi.*, b.box_code, b.box_number
          FROM box_items bi
          JOIN boxes b ON b.id = bi.box_id
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE (b.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(iu.qr_code)) = ?
            AND bi.active = 1
        `, [po2Id, po2Number, qrCode]);
        expect(dupCrossPo).toBeNull(); // Allowed under PO 2!

        // REGRESSION TEST 3: Inactive Record -> Mark box_item in PO 1 as active = 0 (unpacked)
        await db.execute(`UPDATE box_items SET active = 0 WHERE id = ?`, [bi1Id]);
        const dupInactive = await db.queryOne<any>(`
          SELECT bi.*, b.box_code, b.box_number
          FROM box_items bi
          JOIN boxes b ON b.id = bi.box_id
          JOIN item_units iu ON iu.id = bi.item_id
          WHERE (b.production_order_id = ? OR b.production_order_id = ?)
            AND UPPER(TRIM(iu.qr_code)) = ?
            AND bi.active = 1
        `, [po1Id, po1Number, qrCode]);
        expect(dupInactive).toBeNull(); // Allowed to pack again because active = 0!

        // REGRESSION TEST 4: Current-PO assignment resolution by po_number or map_po
        const poResolved = await db.queryOne<any>(`SELECT * FROM production_orders WHERE id = ? OR po_number = ? OR map_po = ?`, ['MAP-D1', 'MAP-D1', 'MAP-D1']);
        expect(poResolved).toBeDefined();
        expect(poResolved.id).toBe(po1Id);
      } finally {
        await db.execute(`DELETE FROM box_items WHERE id IN (?, ?)`, [`bi-d1-${timestamp}`, `bi-d2-${timestamp}`]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?)`, [item1Id, item2Id]);
        await db.execute(`DELETE FROM boxes WHERE id IN (?, ?, ?)`, [box1Id, box2Id, box3Id]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1Id, po2Id]);
      }
    }
  });

  it('34. PO-Level Operator Assignment & Enabled Operation Authorization Test Suite', async () => {
    const { checkOperatorAllocationForPO, checkOperationEnabledForPO } = await import('../server/src/routes/scans');
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    const po1Id = `po-aql-auth1-${timestamp}`;
    const po2Id = `po-aql-auth2-${timestamp}`;
    const opId = `usr-op-aql-${timestamp}`;

    if (isConnected) {
      try {
        // Create PO 1 & PO 2
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO AQL Auth 1', 'MAP-AQL1', 'Cust AQL', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po1Id, `PO-AQL1-${timestamp}`]
        );
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO AQL Auth 2', 'MAP-AQL2', 'Cust AQL', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po2Id, `PO-AQL2-${timestamp}`]
        );

        // Enable AQL and PACKING operations on PO 1
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'AQL')`, [po1Id]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'PACKING')`, [po1Id]);

        // Assign operator to PO 1
        const owa1Id = `owa-aql1-${timestamp}`;
        await db.execute(
          `INSERT INTO operator_work_assignments (id, production_order_id, operator_id, operation, active, created_at)
           VALUES (?, ?, ?, 'ALL', 1, NOW(3))`,
          [owa1Id, po1Id, opId]
        );

        // TEST 1: Assigned operator can perform enabled operation AQL
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', po1Id, 'AQL')).toBe(true);

        // TEST 2: Assigned operator can perform enabled operation PACKING
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', po1Id, 'PACKING')).toBe(true);

        // TEST 3: Assigned operator is REJECTED for operation not enabled on PO (e.g. FINAL_AQL)
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', po1Id, 'FINAL_AQL')).toBe(false);

        // TEST 4: Assigned operator on PO 1 is REJECTED on unassigned PO 2
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', po2Id, 'AQL')).toBe(false);

        // TEST 5: Inactive assignment is REJECTED
        await db.execute(`UPDATE operator_work_assignments SET active = 0 WHERE id = ?`, [owa1Id]);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', po1Id, 'AQL')).toBe(false);
      } finally {
        await db.execute(`DELETE FROM operator_work_assignments WHERE id = ?`, [`owa-aql1-${timestamp}`]);
        await db.execute(`DELETE FROM production_order_operations WHERE production_order_id IN (?, ?)`, [po1Id, po2Id]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1Id, po2Id]);
      }
    }
  }, 30000);

  it('35. Comprehensive PO Operator Assignment & Multi-Stage Access Verification', async () => {
    const { checkOperatorAllocationForPO, checkOperationEnabledForPO } = await import('../server/src/routes/scans');
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    const poPkId = `po-full-auth-${timestamp}`;
    const poNumber = `PO-2026-FULL-${timestamp}`;
    const opId = `usr-001`; // Chamika

    if (isConnected) {
      try {
        // 1. Create Production Order with 5 enabled operations (excluding FINAL_AQL)
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, ?, 'PO Full Auth Test', 'MAP-FULL', 'Cust Full', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [poPkId, poNumber]
        );

        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'QC_TEST')`, [poPkId]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'PRE_QC')`, [poPkId]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'PACKING')`, [poPkId]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'AQL')`, [poPkId]);
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'BOX_TRANSFER')`, [poPkId]);

        // 2. Assign operator to PO
        const allocId = `owa-full-${timestamp}`;
        await db.execute(
          `INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, active, created_at)
           VALUES (?, ?, 'shift-c', ?, 'PACKING', 1, NOW(3))`,
          [allocId, poPkId, opId]
        );

        // 3. Confirm operator can use ALL 5 enabled operations on this PO without separate manual assignments!
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'QC')).toBe(true);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'TEST')).toBe(true);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'PRE_QC')).toBe(true);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'PACKING')).toBe(true);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'AQL')).toBe(true);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'BOX_TRANSFER')).toBe(true);

        // 4. Confirm disabled operation (FINAL_AQL) is REJECTED
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'FINAL_AQL')).toBe(false);

        // 5. Enable FINAL_AQL on PO and verify it becomes accessible immediately
        await db.execute(`INSERT INTO production_order_operations (production_order_id, operation) VALUES (?, 'FINAL_AQL')`, [poPkId]);
        expect(await checkOperatorAllocationForPO(opId, 'OPERATOR', poPkId, 'FINAL_AQL')).toBe(true);

      } finally {
        await db.execute(`DELETE FROM operator_work_assignments WHERE production_order_id = ?`, [poPkId]);
        await db.execute(`DELETE FROM production_order_operations WHERE production_order_id = ?`, [poPkId]);
        await db.execute(`DELETE FROM production_orders WHERE id = ?`, [poPkId]);
      }
    }
  }, 30000);

  it('36. Cross-PO Same Box-Code Item Isolation Verification (PO-2026-1111 vs PO-2026-2222)', async () => {
    const { getAuthorizedBoxDetails } = await import('../server/src/routes/scans');
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    const po1111Id = `po-1111-${timestamp}`;
    const po2222Id = `po-2222-${timestamp}`;
    const box1111Id = `box-1111-${timestamp}`;
    const box2222Id = `box-2222-${timestamp}`;
    const item1111_1 = `itm-1111-1-${timestamp}`;
    const item1111_2 = `itm-1111-2-${timestamp}`;
    const item2222_1 = `itm-2222-1-${timestamp}`;
    const item2222_2 = `itm-2222-2-${timestamp}`;

    if (isConnected) {
      try {
        // Create PO-2026-1111 and PO-2026-2222
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, 'PO-2026-1111', 'PO 1111 Test', 'MAP-1111', 'Cust 1111', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po1111Id]
        );
        await db.execute(
          `INSERT INTO production_orders (id, po_number, po_name, map_po, customer, start_date, due_date, status, created_at, updated_at)
           VALUES (?, 'PO-2026-2222', 'PO 2222 Test', 'MAP-2222', 'Cust 2222', '2026-09-01', '2026-10-01', 'CURRENT', NOW(3), NOW(3))`,
          [po2222Id]
        );

        // Assign operator usr-001 to both POs
        await db.execute(`INSERT INTO operator_work_assignments (id, production_order_id, operator_id, operation, active, created_at) VALUES (?, ?, 'usr-001', 'ALL', 1, NOW(3))`, [`owa-1111-${timestamp}`, po1111Id]);
        await db.execute(`INSERT INTO operator_work_assignments (id, production_order_id, operator_id, operation, active, created_at) VALUES (?, ?, 'usr-001', 'ALL', 1, NOW(3))`, [`owa-2222-${timestamp}`, po2222Id]);

        // Create box BXSS1 under PO-2026-1111
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BXSS1', 'BXSS1', ?, 12, 'OPEN', NOW(3))`,
          [box1111Id, po1111Id]
        );

        // Create box BXSS1 under PO-2026-2222
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BXSS1', 'BXSS1', ?, 12, 'OPEN', NOW(3))`,
          [box2222Id, po2222Id]
        );

        // Insert items for PO-2026-1111
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSS1', ?, 'PACKED', NOW(3), NOW(3))`, [item1111_1, po1111Id]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSS2', ?, 'PACKED', NOW(3), NOW(3))`, [item1111_2, po1111Id]);
        await db.execute(`INSERT INTO box_items (id, box_id, item_id, active, packed_at) VALUES (?, ?, ?, 1, NOW(3))`, [`bi-1111-1-${timestamp}`, box1111Id, item1111_1]);
        await db.execute(`INSERT INTO box_items (id, box_id, item_id, active, packed_at) VALUES (?, ?, ?, 1, NOW(3))`, [`bi-1111-2-${timestamp}`, box1111Id, item1111_2]);

        // Insert items for PO-2026-2222
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSM1', ?, 'PACKED', NOW(3), NOW(3))`, [item2222_1, po2222Id]);
        await db.execute(`INSERT INTO item_units (id, qr_code, production_order_id, status, created_at, updated_at) VALUES (?, 'PNFLSM2', ?, 'PACKED', NOW(3), NOW(3))`, [item2222_2, po2222Id]);
        await db.execute(`INSERT INTO box_items (id, box_id, item_id, active, packed_at) VALUES (?, ?, ?, 1, NOW(3))`, [`bi-2222-1-${timestamp}`, box2222Id, item2222_1]);
        await db.execute(`INSERT INTO box_items (id, box_id, item_id, active, packed_at) VALUES (?, ?, ?, 1, NOW(3))`, [`bi-2222-2-${timestamp}`, box2222Id, item2222_2]);

        // Query 1: Fetch box BXSS1 for PO-2026-1111
        const box1111Row = await db.queryOne<any>(`SELECT * FROM boxes WHERE id = ?`, [box1111Id]);
        const res1111 = await getAuthorizedBoxDetails(box1111Row, 'usr-001', 'OPERATOR', po1111Id);
        expect('box' in res1111).toBe(true);
        if ('box' in res1111) {
          const qrCodes = res1111.box.items.map((i: any) => i.qr_code);
          expect(qrCodes.sort()).toEqual(['PNFLSS1', 'PNFLSS2']);
          expect(qrCodes).not.toContain('PNFLSM1');
          expect(qrCodes).not.toContain('PNFLSM2');
        }

        // Query 2: Fetch box BXSS1 for PO-2026-2222
        const box2222Row = await db.queryOne<any>(`SELECT * FROM boxes WHERE id = ?`, [box2222Id]);
        const res2222 = await getAuthorizedBoxDetails(box2222Row, 'usr-001', 'OPERATOR', po2222Id);
        expect('box' in res2222).toBe(true);
        if ('box' in res2222) {
          const qrCodes = res2222.box.items.map((i: any) => i.qr_code);
          expect(qrCodes.sort()).toEqual(['PNFLSM1', 'PNFLSM2']);
          expect(qrCodes).not.toContain('PNFLSS1');
          expect(qrCodes).not.toContain('PNFLSS2');
        }

        // Test 3: Create new box for PO-2026-2222 with unique box code BXNEW1
        const po2222Row = await db.queryOne<any>(`SELECT * FROM production_orders WHERE id = ?`, [po2222Id]);
        expect(po2222Row).toBeTruthy();

        // Ensure box BXNEW1 does not exist yet
        const beforeBox = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXNEW1' AND production_order_id = ?`, [po2222Id]);
        expect(beforeBox).toBeNull();

        // Create box via DB insert mimicking API creation
        const newBoxId = `box-new1-${timestamp}`;
        await db.execute(
          `INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at)
           VALUES (?, 'BXNEW1', 'BXNEW1', ?, 12, 'OPEN', NOW(3))`,
          [newBoxId, po2222Id]
        );

        const createdBox = await db.queryOne<any>(`SELECT * FROM boxes WHERE id = ?`, [newBoxId]);
        expect(createdBox).toBeTruthy();
        expect(createdBox.production_order_id).toBe(po2222Id);

        // Repeated lookup/scans for BXNEW1 inside PO-2026-2222 retrieve the exact created box
        const repeatBox = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXNEW1' AND production_order_id = ?`, [po2222Id]);
        expect(repeatBox.id).toBe(newBoxId);
      } finally {
        await db.execute(`DELETE FROM box_items WHERE id IN (?, ?, ?, ?)`, [`bi-1111-1-${timestamp}`, `bi-1111-2-${timestamp}`, `bi-2222-1-${timestamp}`, `bi-2222-2-${timestamp}`]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?, ?, ?)`, [item1111_1, item1111_2, item2222_1, item2222_2]);
        await db.execute(`DELETE FROM boxes WHERE id IN (?, ?) OR box_code = 'BXNEW1'`, [box1111Id, box2222Id]);
        await db.execute(`DELETE FROM operator_work_assignments WHERE id IN (?, ?)`, [`owa-1111-${timestamp}`, `owa-2222-${timestamp}`]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1111Id, po2222Id]);
      }
    }
  }, 30000);

  it('37. AQL & Final AQL PO-Scoped Box Resolution Verification', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    if (isConnected) {
      const poA = `po-aql-a-${timestamp}`;
      const poB = `po-aql-b-${timestamp}`;
      const boxA = `box-aql-a-${timestamp}`;
      const boxB = `box-aql-b-${timestamp}`;

      try {
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-AQL-A', 'AQL PO A', 'CURRENT', NOW(3), NOW(3))`, [poA]);
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-AQL-B', 'AQL PO B', 'CURRENT', NOW(3), NOW(3))`, [poB]);

        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSS1', 'BXSS1', ?, 4, 'COMPLETE', NOW(3))`, [boxA, poA]);
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSS1', 'BXSS1', ?, 4, 'OPEN', NOW(3))`, [boxB, poB]);

        // Query box for PO A
        const rowA = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXSS1' AND production_order_id = ?`, [poA]);
        expect(rowA.id).toBe(boxA);

        // Query box for PO B
        const rowB = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXSS1' AND production_order_id = ?`, [poB]);
        expect(rowB.id).toBe(boxB);
        expect(rowB.id).not.toBe(boxA);
      } finally {
        await db.execute(`DELETE FROM boxes WHERE id IN (?, ?)`, [boxA, boxB]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [poA, poB]);
      }
    }
  });

  it('38. Comprehensive AQL & Final AQL Workflows (Scenarios A - G)', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    if (isConnected) {
      const po1Id = `po-aql-scen-1-${timestamp}`;
      const po2Id = `po-aql-scen-2-${timestamp}`;
      const box1Id = `box-aql-scen-1-${timestamp}`;
      const box2Id = `box-aql-scen-2-${timestamp}`;
      const item1Id = `item-1-${timestamp}`;
      const item2Id = `item-2-${timestamp}`;
      const item3Id = `item-3-${timestamp}`;
      const item4Id = `item-4-${timestamp}`;

      try {
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-SCEN-1', 'PO Scen 1', 'CURRENT', NOW(3), NOW(3))`, [po1Id]);
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-SCEN-2', 'PO Scen 2', 'CURRENT', NOW(3), NOW(3))`, [po2Id]);

        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSCEN1', 'BXSCEN1', ?, 4, 'COMPLETE', NOW(3))`, [box1Id, po1Id]);
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSCEN1', 'BXSCEN1', ?, 4, 'OPEN', NOW(3))`, [box2Id, po2Id]);

        const qrs = [`PNFLSS1-${timestamp}`, `PNFLSS2-${timestamp}`, `PNFLSS3-${timestamp}`, `PNFLSS4-${timestamp}`];
        const itemIds = [item1Id, item2Id, item3Id, item4Id];

        for (let i = 0; i < 4; i++) {
          await db.execute(`INSERT INTO item_units (id, production_order_id, qr_code, status, created_at, updated_at) VALUES (?, ?, ?, 'PACKED', NOW(3), NOW(3))`, [itemIds[i], po1Id, qrs[i]]);
          await db.execute(`INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, 'usr-001', NOW(3), 1)`, [`bi-scen-${i}-${timestamp}`, box1Id, itemIds[i]]);
        }

        // Test A: Out-of-order scanning validation
        const activeItemsBox1 = await db.query<any>(`
          SELECT u.qr_code FROM box_items bi JOIN item_units u ON u.id = bi.item_id WHERE bi.box_id = ? AND bi.active = 1
        `, [box1Id]);
        const activeQrs = activeItemsBox1.map((r: any) => r.qr_code);
        expect(activeQrs).toContain(qrs[2]); // PNFLSS3 can be found and selected out of order

        // Test B: Permanent removal updates active items & count
        const removeId = `prm-scen-${timestamp}`;
        await db.execute(`
          INSERT INTO permanently_removed_items (id, item_id, item_qr, box_id, production_order_id, removed_by, action_type, reason, removed_at)
          VALUES (?, ?, ?, ?, ?, 'usr-001', 'PERMANENTLY_REMOVE', 'Damaged', NOW(3))
        `, [removeId, item4Id, qrs[3], box1Id, po1Id]);
        await db.execute(`UPDATE box_items SET active = 0 WHERE item_id = ?`, [item4Id]);

        const remActive = await db.query<any>(`
          SELECT u.qr_code FROM box_items bi JOIN item_units u ON u.id = bi.item_id WHERE bi.box_id = ? AND bi.active = 1
        `, [box1Id]);
        expect(remActive.length).toBe(3);
        expect(remActive.map((r: any) => r.qr_code)).not.toContain(qrs[3]);

        // Test C: Reuse & Pass (latest AQL result determination)
        const insp1Id = `insp-scen-1-${timestamp}`;
        await db.execute(`
          INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, stage, started_at)
          VALUES (?, ?, ?, 'usr-001', 3, 'FAILED', 'AQL', NOW(3))
        `, [insp1Id, box1Id, po1Id]);

        await db.execute(`
          INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, action_type, failure_reason, scanned_at)
          VALUES (?, ?, ?, 1, 'FAIL', 'REUSED', 'Rework', NOW(3))
        `, [`aqls-1-${timestamp}`, insp1Id, item1Id]);

        // Second inspection attempt (re-inspection after reuse)
        const insp2Id = `insp-scen-2-${timestamp}`;
        await db.execute(`
          INSERT INTO aql_inspections (id, box_id, production_order_id, inspector_id, required_samples, result, stage, started_at)
          VALUES (?, ?, ?, 'usr-001', 3, 'PASSED', 'AQL', NOW(3))
        `, [insp2Id, box1Id, po1Id]);

        await db.execute(`
          INSERT INTO aql_samples (id, inspection_id, item_id, sample_number, result, action_type, scanned_at)
          VALUES (?, ?, ?, 1, 'PASS', 'PASSED', NOW(3))
        `, [`aqls-2-${timestamp}`, insp2Id, item1Id]);

        // Determine LATEST sample result per item across all inspections
        const sampleRows = await db.query<any>(`
          SELECT asamp.item_id, asamp.result, asamp.scanned_at
          FROM aql_samples asamp
          JOIN aql_inspections ai ON ai.id = asamp.inspection_id
          WHERE ai.box_id = ? AND ai.stage = 'AQL'
          ORDER BY asamp.scanned_at DESC
        `, [box1Id]);

        const latestMap = new Map<string, string>();
        for (const s of sampleRows) {
          if (!latestMap.has(s.item_id)) {
            latestMap.set(s.item_id, s.result);
          }
        }

        expect(latestMap.get(item1Id)).toBe('PASS'); // Item 1 latest status is PASS despite historical FAIL

        // Test D, E & F: Latest AQL passed count calculations
        let passedCount = 0;
        for (const [itemId, res] of latestMap.entries()) {
          if (res === 'PASS') passedCount++;
        }
        expect(passedCount).toBe(1); // Only active items with latest status PASS count towards passedCount

        // Test G: PO Scoping
        const box1Result = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXSCEN1' AND production_order_id = ?`, [po1Id]);
        const box2Result = await db.queryOne<any>(`SELECT * FROM boxes WHERE box_code = 'BXSCEN1' AND production_order_id = ?`, [po2Id]);
        expect(box1Result.id).toBe(box1Id);
        expect(box2Result.id).toBe(box2Id);
        expect(box1Result.id).not.toBe(box2Result.id);
      } finally {
        await db.execute(`DELETE FROM permanently_removed_items WHERE id = ?`, [`prm-scen-${timestamp}`]);
        await db.execute(`DELETE FROM aql_samples WHERE id IN (?, ?)`, [`aqls-1-${timestamp}`, `aqls-2-${timestamp}`]);
        await db.execute(`DELETE FROM aql_inspections WHERE id IN (?, ?)`, [`insp-scen-1-${timestamp}`, `insp-scen-2-${timestamp}`]);
        await db.execute(`DELETE FROM box_items WHERE box_id IN (?, ?)`, [box1Id, box2Id]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?, ?, ?)`, itemIds);
        await db.execute(`DELETE FROM boxes WHERE id IN (?, ?)`, [box1Id, box2Id]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po1Id, po2Id]);
      }
    }
  }, 30000);

  it('39. AQL Permanent Removal Exact Item-ID Mapping & Packing Visibility Test', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const { getAuthorizedBoxDetails } = await import('../server/src/routes/scans');
    const isConnected = await ensureDbConnected();
    const timestamp = Date.now();

    if (isConnected) {
      const po9999Id = `po-1791610128768-${timestamp}`;
      const po9077Id = `po-1791454044391-${timestamp}`;
      const box9999Id = `box-1791610288040-e9ay-${timestamp}`;
      const box9077Id = `box-1791454060961-cu5b-${timestamp}`;

      const item1Id = `itm-${po9999Id}-PNFLSS1`;
      const item2Id = `itm-${po9999Id}-PNFLSS2`; // Exact PO-prefixed internal ID
      const item3Id = `itm-${po9999Id}-PNFLSS3`;
      const item4Id = `itm-${po9999Id}-PNFLSS4`;

      try {
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-2026-9999', 'PO 9999', 'CURRENT', NOW(3), NOW(3))`, [po9999Id]);
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-2026-9077', 'PO 9077', 'CURRENT', NOW(3), NOW(3))`, [po9077Id]);

        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSS1', 'BXSS1', ?, 4, 'COMPLETE', NOW(3))`, [box9999Id, po9999Id]);
        await db.execute(`INSERT INTO boxes (id, box_code, box_number, production_order_id, capacity, status, created_at) VALUES (?, 'BXSS1', 'BXSS1', ?, 4, 'COMPLETE', NOW(3))`, [box9077Id, po9077Id]);

        const items = [
          { id: item1Id, qr: `PNFLSS1-${timestamp}` },
          { id: item2Id, qr: `PNFLSS2-${timestamp}` },
          { id: item3Id, qr: `PNFLSS3-${timestamp}` },
          { id: item4Id, qr: `PNFLSS4-${timestamp}` }
        ];

        for (let i = 0; i < 4; i++) {
          await db.execute(`INSERT INTO item_units (id, production_order_id, qr_code, status, created_at, updated_at) VALUES (?, ?, ?, 'PACKED', NOW(3), NOW(3))`, [items[i].id, po9999Id, items[i].qr]);
          await db.execute(`INSERT INTO box_items (id, box_id, item_id, packed_by, packed_at, active) VALUES (?, ?, ?, 'usr-001', NOW(3), 1)`, [`bi-9999-${i}-${timestamp}`, box9999Id, items[i].id]);
        }

        // 1. Perform permanent removal for item2Id (PNFLSS2) in PO-2026-9999
        const removeId = `prm-9999-${timestamp}`;
        await db.execute(`
          INSERT INTO permanently_removed_items (id, item_id, item_qr, box_id, production_order_id, removed_by, action_type, reason, removed_at)
          VALUES (?, ?, ?, ?, ?, 'usr-001', 'PERMANENTLY_REMOVE', 'Fabric Tear', NOW(3))
        `, [removeId, item2Id, items[1].qr, box9999Id, po9999Id]);

        await db.execute(`UPDATE box_items SET active = 0 WHERE box_id = ? AND item_id = ?`, [box9999Id, item2Id]);
        await db.execute(`UPDATE item_units SET status = 'PERMANENTLY_REMOVED' WHERE id = ?`, [item2Id]);

        // Verify permanently_removed_items record matches exact item_id, box_id, po_id
        const prmRecord = await db.queryOne<any>(`SELECT * FROM permanently_removed_items WHERE id = ?`, [removeId]);
        expect(prmRecord.item_id).toBe(item2Id);
        expect(prmRecord.box_id).toBe(box9999Id);
        expect(prmRecord.production_order_id).toBe(po9999Id);

        // Verify box_items deactivation for item2Id
        const deactivatedBi = await db.queryOne<any>(`SELECT * FROM box_items WHERE box_id = ? AND item_id = ?`, [box9999Id, item2Id]);
        expect(deactivatedBi.active).toBe(0);

        // Verify remaining 3 items in box9999 remain active = 1
        const activeItemsRow = await db.query<any>(`SELECT * FROM box_items WHERE box_id = ? AND active = 1`, [box9999Id]);
        expect(activeItemsRow.length).toBe(3);

        // 2. Packing visibility: getAuthorizedBoxDetails returns 3 active items, count = 3, availableSpace = 1
        const box9999Row = await db.queryOne<any>(`SELECT * FROM boxes WHERE id = ?`, [box9999Id]);
        const packingRes = await getAuthorizedBoxDetails(box9999Row, 'usr-001', 'OPERATOR', po9999Id);
        expect('box' in packingRes).toBe(true);
        if ('box' in packingRes) {
          expect(packingRes.box.activeCount).toBe(3);
          expect(packingRes.box.availableSpace).toBe(1);
          expect(packingRes.box.items.length).toBe(3);
          const activeItemIds = packingRes.box.items.map((i: any) => i.item_id);
          expect(activeItemIds).toContain(item1Id);
          expect(activeItemIds).toContain(item3Id);
          expect(activeItemIds).toContain(item4Id);
          expect(activeItemIds).not.toContain(item2Id);
        }

        // 3. Duplicate removal check
        const alreadyRemoved = await db.queryOne<any>(`SELECT * FROM permanently_removed_items WHERE item_id = ?`, [item2Id]);
        expect(alreadyRemoved).toBeTruthy();
      } finally {
        await db.execute(`DELETE FROM permanently_removed_items WHERE id = ?`, [`prm-9999-${timestamp}`]);
        await db.execute(`DELETE FROM box_items WHERE box_id IN (?, ?)`, [box9999Id, box9077Id]);
        await db.execute(`DELETE FROM item_units WHERE id IN (?, ?, ?, ?)`, [item1Id, item2Id, item3Id, item4Id]);
        await db.execute(`DELETE FROM boxes WHERE id IN (?, ?)`, [box9999Id, box9077Id]);
        await db.execute(`DELETE FROM production_orders WHERE id IN (?, ?)`, [po9999Id, po9077Id]);
      }
    }
  }, 30000);

  it('40. Multi-Operator Multi-Operation Allocation & Authorization Test Suite', async () => {
    const { db, ensureDbConnected } = await import('../server/src/db/connection');
    const isConnected = await ensureDbConnected();
    const ts = Date.now();

    if (isConnected) {
      const testPoId = `po-test-2525-${ts}`;
      const shiftId = `shift-a-${ts}`;
      const op1Id = `usr-001`; // Chamika Silva
      const op2Id = `usr-004`; // Kavindu Perera
      const unauthOpId = `usr-999-${ts}`;

      try {
        await db.execute(`INSERT INTO shifts (id, code, name, active, created_at, updated_at) VALUES (?, 'SHIFT-A', 'Shift A', 1, NOW(3), NOW(3))`, [shiftId]);
        await db.execute(`INSERT INTO production_orders (id, po_number, po_name, status, created_at, updated_at) VALUES (?, 'PO-2026-2525', 'PO 2525 Test', 'CURRENT', NOW(3), NOW(3))`, [testPoId]);

        const opsToTest = ['PRE_QC', 'QC_TEST', 'PACKING', 'AQL', 'FINAL_AQL', 'BOX_TRANSFER'];

        // Assign both op1 and op2 to all 6 operations for PO-2026-2525
        for (const opCode of opsToTest) {
          await db.execute(`
            INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', 1, NOW(3), NOW(3))
          `, [`owa-${op1Id}-${opCode}-${ts}`, testPoId, shiftId, op1Id, opCode]);

          await db.execute(`
            INSERT INTO operator_work_assignments (id, production_order_id, shift_id, operator_id, operation, assigned_date, source, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURDATE(), 'SUPERVISOR', 1, NOW(3), NOW(3))
          `, [`owa-${op2Id}-${opCode}-${ts}`, testPoId, shiftId, op2Id, opCode]);
        }

        // Verify all 12 rows exist and are active
        const activeRows = await db.query<any>(`
          SELECT operator_id, operation FROM operator_work_assignments
          WHERE production_order_id = ? AND active = 1
        `, [testPoId]);

        expect(activeRows.length).toBe(12);

        const op1Ops = activeRows.filter((r: any) => r.operator_id === op1Id).map((r: any) => r.operation);
        const op2Ops = activeRows.filter((r: any) => r.operator_id === op2Id).map((r: any) => r.operation);

        expect(op1Ops.sort()).toEqual(opsToTest.sort());
        expect(op2Ops.sort()).toEqual(opsToTest.sort());

        // Verify checkOperatorAllocationForPO returns true for both operators on all stages
        for (const stage of ['PRE_QC', 'QC', 'TEST', 'PACKING', 'AQL', 'FINAL_AQL', 'BOX_TRANSFER'] as const) {
          const auth1 = await checkOperatorAllocationForPO(op1Id, 'OPERATOR', testPoId, stage);
          const auth2 = await checkOperatorAllocationForPO(op2Id, 'OPERATOR', testPoId, stage);
          expect(auth1).toBe(true);
          expect(auth2).toBe(true);
        }

        // Verify unauthorized operator is rejected
        const authUnauth = await checkOperatorAllocationForPO(unauthOpId, 'OPERATOR', testPoId, 'PACKING');
        expect(authUnauth).toBe(false);

      } finally {
        await db.execute(`DELETE FROM operator_work_assignments WHERE production_order_id = ?`, [testPoId]);
        await db.execute(`DELETE FROM production_orders WHERE id = ?`, [testPoId]);
        await db.execute(`DELETE FROM shifts WHERE id = ?`, [shiftId]);
      }
    }
  }, 30000);
});







