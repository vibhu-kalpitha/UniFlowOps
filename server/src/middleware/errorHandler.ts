import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { db } from '../db/connection.js';
import { AuthRequest } from './auth';

export async function auditLog(actorId: string | null, action: string, entityType: string, entityId: string | null, payload?: any) {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString().slice(2, 6)}`;
    const now = new Date().toISOString();
    const payloadStr = payload ? JSON.stringify(payload) : null;
    await db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, actorId, action, entityType, entityId, payloadStr, now);
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

export function errorHandler(err: any, req: AuthRequest, res: Response, next: NextFunction) {
  console.error('API Error:', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      details: err.errors
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    error: err.code || 'SERVER_ERROR',
    message
  });
}
