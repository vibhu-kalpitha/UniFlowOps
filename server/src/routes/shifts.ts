import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// GET /api/shifts — List Shift A-D records with member counts
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const shifts = await db.prepare(`SELECT * FROM shifts WHERE active = 1 ORDER BY start_time ASC`).all() as any[];

    // Attach member count + member list to each shift
    const enriched = await Promise.all(shifts.map(async (shift: any) => {
      const members = await db.prepare(`
        SELECT sm.id as member_id, sm.operator_id, sm.effective_from,
               u.full_name, u.username, u.employee_no
        FROM shift_members sm
        JOIN users u ON u.id = sm.operator_id
        WHERE sm.shift_id = ? AND sm.active = 1
        ORDER BY u.full_name ASC
      `).all(shift.id) as any[];
      return { ...shift, members };
    }));

    return res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/all-members — All active shift assignments across all shifts
// Used by PO creation page to show pre-assigned roster
router.get('/all-members', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req, res, next) => {
  try {
    const rows = await db.prepare(`
      SELECT sm.id as member_id,
             sm.shift_id,
             sm.operator_id,
             sm.effective_from,
             s.code   as shift_code,
             s.name   as shift_name,
             s.start_time,
             s.end_time,
             u.full_name,
             u.username,
             u.employee_no
      FROM shift_members sm
      JOIN shifts s ON s.id = sm.shift_id
      JOIN users u ON u.id = sm.operator_id
      WHERE sm.active = 1
        AND s.active = 1
      ORDER BY s.start_time ASC, u.full_name ASC
    `).all() as any[];

    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/:id/members — List members of a specific shift
router.get('/:id/members', authenticateToken, async (req, res, next) => {
  try {
    const members = await db.prepare(`
      SELECT sm.id as member_id, sm.operator_id, sm.effective_from,
             u.full_name, u.username, u.employee_no,
             s.code as shift_code, s.name as shift_name, s.start_time, s.end_time
      FROM shift_members sm
      JOIN users u ON u.id = sm.operator_id
      JOIN shifts s ON s.id = sm.shift_id
      WHERE (sm.shift_id = ? OR sm.shift_id = (SELECT id FROM shifts WHERE code = ? OR name = ?))
        AND sm.active = 1
      ORDER BY u.full_name ASC
    `).all(req.params.id, req.params.id, req.params.id);

    return res.json(members);
  } catch (err) {
    next(err);
  }
});

const addMemberSchema = z.object({
  operatorId: z.string().min(1)
});

// POST /api/shifts/:id/members — SUPERVISOR + ADMIN can add members
router.post('/:id/members', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { operatorId } = addMemberSchema.parse(req.body);
    const shiftIdParam = req.params.id;

    const shift = await db.prepare(`SELECT id, code, name FROM shifts WHERE id = ? OR code = ? OR name = ?`).get(shiftIdParam, shiftIdParam, shiftIdParam) as any;
    if (!shift) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
    }

    const operator = await db.prepare(`SELECT id, full_name FROM users WHERE (id = ? OR username = ? OR employee_no = ?) AND role = 'OPERATOR' AND active = 1`).get(operatorId, operatorId, operatorId) as any;
    if (!operator) {
      return res.status(404).json({ error: 'OPERATOR_NOT_FOUND', message: 'Operator user not found' });
    }

    // Check if already assigned to this shift
    const existing = await db.prepare(`SELECT id FROM shift_members WHERE shift_id = ? AND operator_id = ?`).get(shift.id, operator.id) as any;

    const memberId = existing?.id || `sm-${Date.now()}`;

    if (existing) {
      await db.prepare(`UPDATE shift_members SET active = 1, effective_from = NOW(3) WHERE id = ?`).run(existing.id);
    } else {
      await db.prepare(`
        INSERT INTO shift_members (id, shift_id, operator_id, effective_from, active)
        VALUES (?, ?, ?, NOW(3), 1)
      `).run(memberId, shift.id, operator.id);
    }

    await auditLog(req.user!.id, 'ADD_SHIFT_MEMBER', 'shift_members', memberId, { shiftId: shift.id, operatorId: operator.id });

    return res.status(201).json({
      message: `${operator.full_name} added to ${shift.name}`,
      member: {
        member_id: memberId,
        shift_id: shift.id,
        shift_code: shift.code,
        shift_name: shift.name,
        operator_id: operator.id,
        full_name: operator.full_name
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shifts/:id/members/:operatorId — SUPERVISOR + ADMIN can remove members
router.delete('/:id/members/:operatorId', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const { id: shiftIdParam, operatorId } = req.params;

    const shift = await db.prepare(`SELECT id FROM shifts WHERE id = ? OR code = ? OR name = ?`).get(shiftIdParam, shiftIdParam, shiftIdParam) as any;
    const shiftId = shift ? shift.id : shiftIdParam;

    await db.prepare(`
      UPDATE shift_members SET active = 0
      WHERE shift_id = ? AND (operator_id = ? OR operator_id = (SELECT id FROM users WHERE username = ? OR employee_no = ?))
    `).run(shiftId, operatorId, operatorId, operatorId);

    await auditLog(req.user!.id, 'REMOVE_SHIFT_MEMBER', 'shift_members', null, { shiftId, operatorId });

    return res.json({ message: 'Operator removed from shift' });
  } catch (err) {
    next(err);
  }
});

// GET /api/operators — List all active operators (for dropdown)
router.get('/operators-list', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req, res, next) => {
  try {
    const operators = await db.prepare(`
      SELECT id, full_name, username, employee_no
      FROM users
      WHERE role = 'OPERATOR' AND active = 1
      ORDER BY full_name ASC
    `).all();
    return res.json(operators);
  } catch (err) {
    next(err);
  }
});

export default router;
