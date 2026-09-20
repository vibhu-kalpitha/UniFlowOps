import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// GET /api/shifts - List Shift A-D records
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const shifts = await db.prepare(`SELECT * FROM shifts WHERE active = 1 ORDER BY start_time ASC`).all();
    return res.json(shifts);
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/:id/members - List members of shift
router.get('/:id/members', authenticateToken, async (req, res, next) => {
  try {
    const members = await db.prepare(`
      SELECT sm.*, u.full_name, u.username, u.employee_no
      FROM shift_members sm
      JOIN users u ON u.id = sm.operator_id
      WHERE (sm.shift_id = ? OR sm.shift_id = (SELECT id FROM shifts WHERE code = ?))
        AND sm.active = 1
    `).all(req.params.id, req.params.id);

    return res.json(members);
  } catch (err) {
    next(err);
  }
});

const addMemberSchema = z.object({
  operatorId: z.string().min(1)
});

// POST /api/shifts/:id/members - ADMIN ONLY! (Supervisor receives 403)
router.post('/:id/members', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { operatorId } = addMemberSchema.parse(req.body);
    const shiftIdParam = req.params.id;

    const shift = await db.prepare(`SELECT id, code FROM shifts WHERE id = ? OR code = ?`).get(shiftIdParam, shiftIdParam) as any;
    if (!shift) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
    }

    const operator = await db.prepare(`SELECT id, full_name FROM users WHERE (id = ? OR username = ?) AND role = 'OPERATOR'`).get(operatorId, operatorId) as any;
    if (!operator) {
      return res.status(404).json({ error: 'OPERATOR_NOT_FOUND', message: 'Operator user not found' });
    }

    const memberId = `sm-${Date.now()}`;
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO shift_members (id, shift_id, operator_id, effective_from, active)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), active = 1
    `).run(memberId, shift.id, operator.id, now);

    await auditLog(req.user!.id, 'ADD_SHIFT_MEMBER', 'shift_members', memberId, { shiftId: shift.id, operatorId: operator.id });

    return res.status(201).json({
      message: `Operator ${operator.full_name} added to ${shift.code}`,
      member: { id: memberId, shiftId: shift.id, operatorId: operator.id }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shifts/:id/members/:operatorId - ADMIN ONLY!
router.delete('/:id/members/:operatorId', authenticateToken, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { id: shiftIdParam, operatorId } = req.params;

    const shift = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ?`).get(shiftIdParam, shiftIdParam) as any;
    const shiftId = shift ? shift.id : shiftIdParam;

    await db.prepare(`
      UPDATE shift_members SET active = 0 WHERE shift_id = ? AND (operator_id = ? OR operator_id = (SELECT id FROM users WHERE username = ?))
    `).run(shiftId, operatorId, operatorId);

    await auditLog(req.user!.id, 'REMOVE_SHIFT_MEMBER', 'shift_members', null, { shiftId, operatorId });

    return res.json({ message: 'Operator removed from shift' });
  } catch (err) {
    next(err);
  }
});

export default router;
