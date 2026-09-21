import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME || 'uniflow_ops',
      user: process.env.DB_USER || 'uniflow_ops_app',
      password: process.env.DB_PASSWORD || '',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      namedPlaceholders: false,
      dateStrings: true,
    });
  }
  return pool;
}

export interface StatementRunner {
  all(...params: any[]): Promise<any[]>;
  get(...params: any[]): Promise<any>;
  run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

/**
 * Safely format a JavaScript Date, string, or timestamp into a MySQL-compatible 
 * DATETIME(3) string format 'YYYY-MM-DD HH:mm:ss.SSS' without 'T' or 'Z'.
 */
export function formatMySqlDateTime(date?: Date | string | number): string {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

export class DbConnection {
  private client: Pool | PoolConnection;

  constructor(client?: Pool | PoolConnection) {
    this.client = client || getPool();
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const flatParams = params.flat();
    const [rows] = await this.client.query(sql, flatParams);
    return rows as T[];
  }

  public async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    const flatParams = params.flat();
    const [result] = await this.client.query(sql, flatParams);
    const res = result as any;
    return {
      changes: res.affectedRows || 0,
      lastInsertRowid: res.insertId || 0
    };
  }

  public prepare(sql: string): StatementRunner {
    const self = this;
    return {
      async all(...params: any[]): Promise<any[]> {
        return self.query(sql, params);
      },
      async get(...params: any[]): Promise<any> {
        return self.queryOne(sql, params);
      },
      async run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
        return self.execute(sql, params);
      }
    };
  }

  public async exec(sql: string): Promise<void> {
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await this.client.query(statement);
    }
  }

  public async transaction<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    if ('getConnection' in this.client) {
      const conn = await (this.client as Pool).getConnection();
      await conn.beginTransaction();
      try {
        const txDb = new DbConnection(conn);
        const result = await fn(txDb);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else {
      // Already in a connection transaction
      return fn(this);
    }
  }
}

export const db = new DbConnection();

export async function ensureDbConnected(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

export async function resetDbConnection() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  return ensureDbConnected();
}
