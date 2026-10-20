import { Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/errorHandler.js';

const router = ExpressRouter();

// GET /api/shifts — List Shift A-D records with member counts
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const shifts = await db.prepare(`SELECT * FROM shifts WHERE active = 1 ORDER BY code ASC, name ASC`).all() as any[];

    // Attach member count + member list to each shift
    const enriched = await Promise.all(shifts.map(async (shift: any) => {
      const members = await db.prepare(`
        SELECT sm.id as member_id, sm.operator_id, sm.effective_from,
               u.full_name, u.username, u.employee_no, u.plant
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
             u.employee_no,
             u.plant
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
             u.full_name, u.username, u.employee_no, u.plant,
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
      SELECT id, full_name, username, employee_no, plant
      FROM users
      WHERE role = 'OPERATOR' AND active = 1
      ORDER BY full_name ASC
    `).all();
    return res.json(operators);
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/allocate-time-frames — Allocate Shift Groups to 1st, 2nd, 3rd Time Frames
router.post('/allocate-time-frames', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      allocations: z.array(z.object({
        timeFrameId: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        shiftId: z.string().nullable().optional()
      }))
    });
    const { allocations } = schema.parse(req.body);

    await db.transaction(async (tx) => {
      // Clear time frame allocations for specified time frames
      for (const a of allocations) {
        await tx.prepare(`UPDATE shifts SET time_frame_id = NULL WHERE time_frame_id = ?`).run(a.timeFrameId);
      }

      // Assign specified shifts
      for (const a of allocations) {
        if (a.shiftId && a.shiftId.trim() !== '') {
          await tx.prepare(`
            UPDATE shifts 
            SET time_frame_id = ?, start_time = ?, end_time = ?
            WHERE id = ?
          `).run(a.timeFrameId, a.startTime, a.endTime, a.shiftId);
        }
      }
    });

    await auditLog(req.user!.id, 'ALLOCATE_SHIFT_TIME_FRAMES', 'shifts', null, { allocations });

    return res.json({ message: 'Shift time frames allocated successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts — Create a new shift group (e.g. Shift C, Shift D)
router.post('/', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      code: z.string().min(1).max(10),
      name: z.string().min(1).max(100)
    });
    const { code, name } = schema.parse(req.body);
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    const shiftId = `shift-${cleanCode.toLowerCase()}`;

    const existing = await db.prepare(`SELECT id, active FROM shifts WHERE id = ? OR code = ?`).get(shiftId, cleanCode) as any;
    if (existing) {
      if (existing.active === 0) {
        await db.prepare(`UPDATE shifts SET active = 1, name = ?, start_time = '--:--', end_time = '--:--', time_frame_id = NULL WHERE id = ?`).run(cleanName, existing.id);
        return res.status(200).json({ message: `Shift ${cleanName} restored successfully`, shift: { id: existing.id, code: cleanCode, name: cleanName } });
      }
      return res.status(400).json({ error: 'SHIFT_EXISTS', message: `Shift group "${cleanCode}" already exists` });
    }

    await db.prepare(`
      INSERT INTO shifts (id, code, name, start_time, end_time, time_frame_id, active)
      VALUES (?, ?, ?, '--:--', '--:--', NULL, 1)
    `).run(shiftId, cleanCode, cleanName);

    await auditLog(req.user!.id, 'CREATE_SHIFT', 'shifts', shiftId, { code: cleanCode, name: cleanName });

    return res.status(201).json({
      message: `Shift group ${cleanName} created successfully`,
      shift: { id: shiftId, code: cleanCode, name: cleanName, start_time: '--:--', end_time: '--:--', members: [] }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shifts/:id — Delete/deactivate a custom shift group (Shift C, D...)
router.delete('/:id', authenticateToken, requireRole(['SUPERVISOR', 'ADMIN']), async (req: AuthRequest, res, next) => {
  try {
    const shiftId = req.params.id;
    const shift = await db.prepare(`SELECT id, code, name FROM shifts WHERE id = ?`).get(shiftId) as any;
    if (!shift) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: 'Shift not found' });
    }
    if (shift.code === 'A' || shift.code === 'B') {
      return res.status(400).json({ error: 'PROTECTED_SHIFT', message: 'Default Shift A and Shift B cannot be deleted.' });
    }

    await db.transaction(async (tx) => {
      await tx.prepare(`UPDATE shift_members SET active = 0 WHERE shift_id = ?`).run(shiftId);
      await tx.prepare(`UPDATE shifts SET active = 0, time_frame_id = NULL WHERE id = ?`).run(shiftId);
    });

    await auditLog(req.user!.id, 'DELETE_SHIFT', 'shifts', shiftId, { code: shift.code, name: shift.name });

    return res.json({ message: `Shift group ${shift.name} deleted successfully` });
  } catch (err) {
    next(err);
  }
});

export default router;
