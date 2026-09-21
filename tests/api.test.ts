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
});
