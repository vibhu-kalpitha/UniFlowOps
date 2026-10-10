import { describe, it } from 'vitest';
import { db } from '../server/src/db/connection.js';

describe('Dump OWA', () => {
  it('should dump OWA', async () => {
    const rows = await db.prepare('SELECT id, production_order_id, operator_id, operation, active FROM operator_work_assignments').all() as any[];
    console.log(JSON.stringify(rows, null, 2));
  });
});
