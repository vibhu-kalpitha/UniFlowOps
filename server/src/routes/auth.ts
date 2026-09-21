import { Router as ExpressRouter, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { generateToken, authenticateToken, requireRole, hashToken, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const user = await db.prepare(`SELECT * FROM users WHERE username = ? AND active = 1`).get(username) as any;

    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    // Resolve user's lineId
    let lineId = 'Line 04';
    if (user.role === 'OPERATOR') {
      const member = await db.prepare(`
        SELECT pl.name FROM shift_members sm
        JOIN sales_orders so ON so.shift_id = sm.shift_id
        JOIN production_lines pl ON pl.id = so.line_id
        WHERE sm.operator_id = ? AND sm.active = 1
        LIMIT 1
      `).get(user.id) as any;
      if (member) lineId = member.name;
    } else if (user.role === 'SUPERVISOR') {
      lineId = 'Line 04 & Line 02';
    } else {
      lineId = 'All Lines';
    }

    const initials = user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase();

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name
    });

    // Compute token hash for database session tracking
    const tokenHash = hashToken(token);
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.get('user-agent') || 'Unknown';
    const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || '8', 10);
    const expiresAtDate = new Date(Date.now() + ttlHours * 3600 * 1000);
    const expiresAt = expiresAtDate.toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(`
      INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, login_at, last_seen_at, expires_at, active)
      VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3), ?, 1)
    `, [sessionId, user.id, tokenHash, ipAddress, userAgent, expiresAt]);

    await auditLog(user.id, 'LOGIN', 'user', user.id, { username, ipAddress });

    return res.json({
      token,
      user: {
        id: user.id,
        employeeNo: user.employee_no,
        username: user.username,
        name: user.full_name,
        role: user.role.toLowerCase(), // operator | supervisor | admin
        lineId,
        avatarInitials: initials
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const tokenHash = hashToken(token);
      await db.execute(`
        UPDATE user_sessions SET active = 0, logout_at = NOW(3) WHERE token_hash = ? AND active = 1
      `, [tokenHash]);
    }

    if (req.user) {
      await auditLog(req.user.id, 'LOGOUT', 'user', req.user.id, { username: req.user.username });
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const user = await db.prepare(`SELECT id, employee_no, username, full_name, role FROM users WHERE id = ?`).get(req.user!.id) as any;
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User record not found' });
    }

    const initials = user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase();

    return res.json({
      user: {
        id: user.id,
        employeeNo: user.employee_no,
        username: user.username,
        name: user.full_name,
        role: user.role.toLowerCase(),
        avatarInitials: initials
      }
    });
  } catch (err) {
    next(err);
  }
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(6)
});

// POST /api/auth/reset-password - ADMIN ONLY
router.post('/reset-password', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { userId, newPassword } = resetPasswordSchema.parse(req.body);

    const user = await db.prepare(`SELECT id, username, full_name FROM users WHERE id = ? OR username = ?`).get(userId, userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await db.prepare(`UPDATE users SET password_hash = ?, updated_at = NOW(3) WHERE id = ?`).run(passwordHash, user.id);

    await auditLog(req.user!.id, 'RESET_PASSWORD', 'users', user.id, { username: user.username });

    return res.json({
      message: `Password reset successfully for user ${user.username}`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sessions - ADMIN ONLY
router.get('/admin/sessions', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const sessions = await db.query(`
      SELECT 
        s.id,
        s.user_id,
        u.username,
        u.role,
        u.full_name,
        s.ip_address,
        s.user_agent,
        s.login_at,
        s.last_seen_at,
        s.logout_at,
        s.expires_at,
        s.revoked_at,
        s.active
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.login_at DESC
      LIMIT 100
    `);

    const formatted = sessions.map(s => {
      const now = new Date();
      const expires = new Date(s.expires_at);
      let status = 'ACTIVE';
      if (s.revoked_at) {
        status = 'REVOKED';
      } else if (s.logout_at) {
        status = 'LOGGED_OUT';
      } else if (expires <= now || !s.active) {
        status = 'EXPIRED';
      }

      return {
        id: s.id,
        userId: s.user_id,
        username: s.username,
        role: s.role.toLowerCase(),
        fullName: s.full_name,
        ipAddress: s.ip_address || '127.0.0.1',
        userAgent: s.user_agent || 'Unknown',
        loginAt: s.login_at,
        lastSeenAt: s.last_seen_at,
        logoutAt: s.logout_at,
        expiresAt: s.expires_at,
        revokedAt: s.revoked_at,
        active: Boolean(s.active && status === 'ACTIVE'),
        status
      };
    });

    return res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sessions/:id/revoke - ADMIN ONLY
router.post('/admin/sessions/:id/revoke', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const sessionId = req.params.id;
    const session = await db.queryOne(`SELECT * FROM user_sessions WHERE id = ?`, [sessionId]);

    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found' });
    }

    await db.execute(`
      UPDATE user_sessions SET active = 0, revoked_at = NOW(3) WHERE id = ?
    `, [sessionId]);

    await auditLog(req.user!.id, 'REVOKE_SESSION', 'user_sessions', sessionId, { targetUserId: session.user_id });

    return res.json({ message: 'Session revoked successfully', sessionId });
  } catch (err) {
    next(err);
  }
});

export default router;
