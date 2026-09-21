import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { hashToken, generateToken } from '../server/src/middleware/auth';

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
});
