import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { db } from '../db/connection.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-uniflow-2026';

export interface AuthUser {
  id: string;
  username: string;
  role: 'OPERATOR' | 'SUPERVISOR' | 'ADMIN';
  fullName: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken(user: { id: string; username: string; role: string; fullName: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  let payload: AuthUser;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired authentication token' });
  }

  try {
    const tokenHash = hashToken(token);
    const session = await db.queryOne<{ id: string; active: number; expires_at: string; revoked_at: string | null; logout_at: string | null }>(
      `SELECT id, active, expires_at, revoked_at, logout_at FROM user_sessions WHERE token_hash = ? AND active = 1 AND revoked_at IS NULL AND logout_at IS NULL AND expires_at > NOW(3)`,
      [tokenHash]
    );

    if (!session) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired, revoked, or invalid' });
    }

    // Safely update last_seen_at
    db.execute(`UPDATE user_sessions SET last_seen_at = NOW(3) WHERE id = ?`, [session.id]).catch(err => {
      console.warn('Could not update last_seen_at for session', session.id, err);
    });

    req.user = payload;
    req.sessionId = session.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session verification failed' });
  }
}

export function requireRole(allowedRoles: string | string[]) {
  const roles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(r => r.toUpperCase());

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not authenticated' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Role ${req.user.role} is unauthorized to perform this operation`
      });
    }

    next();
  };
}
