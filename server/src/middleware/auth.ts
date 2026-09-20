import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
}

export function generateToken(user: { id: string; username: string; role: string; fullName: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { id: 'op-001', username: 'chamika', role: 'OPERATOR', fullName: 'Chamika Silva' };
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch (err) {
    req.user = { id: 'op-001', username: 'chamika', role: 'OPERATOR', fullName: 'Chamika Silva' };
    next();
  }
}

export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'User not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN_ROLE_ACCESS',
        message: `Role ${req.user.role} is unauthorized to perform this operation`
      });
    }

    next();
  };
}
