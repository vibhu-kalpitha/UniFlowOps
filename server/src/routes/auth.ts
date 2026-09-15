import { Router as ExpressRouter, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/errorHandler';

const router = ExpressRouter();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post('/login', (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const user = db.prepare(`SELECT * FROM users WHERE username = ? AND active = 1`).get(username) as any;

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
      const member = db.prepare(`
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

    auditLog(user.id, 'LOGIN', 'user', user.id, { username });

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

router.get('/me', authenticateToken, (req: AuthRequest, res, next) => {
  try {
    const user = db.prepare(`SELECT id, employee_no, username, full_name, role FROM users WHERE id = ?`).get(req.user!.id) as any;
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

export default router;
