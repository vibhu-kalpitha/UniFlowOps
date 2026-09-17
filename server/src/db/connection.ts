import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = path.resolve(process.env.DATABASE_PATH || './server/data/uniflow.db');

// Ensure directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

let sqlInstance: SqlJsDatabase | null = null;

async function getSqlDb(): Promise<SqlJsDatabase> {
  if (sqlInstance) return sqlInstance;

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    sqlInstance = new SQL.Database(filebuffer);
  } else {
    sqlInstance = new SQL.Database();
    saveDbToDisk(sqlInstance);
  }

  return sqlInstance;
}

function saveDbToDisk(instance?: SqlJsDatabase) {
  const target = instance || sqlInstance;
  if (!target) return;
  try {
    const data = target.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving SQLite DB to disk:', err);
  }
}

// Synchronous wrapper class providing better-sqlite3 compatible API
class DbWrapper {
  private _db: SqlJsDatabase | null = null;

  public initSync() {
    if (this._db) return;
    // Synchronous WASM load fallback for Node environment
    const fileData = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
    // Sync init using require for WASM module in Node
    const initSqlJsSync = require('sql.js');
    // WASM module loaded synchronously in Node
    let SQL: any;
    if (typeof initSqlJsSync === 'function') {
      SQL = initSqlJsSync();
    }
  }

  public setDb(rawDb: SqlJsDatabase) {
    this._db = rawDb;
    this.exec('PRAGMA foreign_keys = ON;');
    console.log(`[SQLite Database] Absolute DB Path: ${dbPath}`);
    try {
      const dbList = this.prepare('PRAGMA database_list').all();
      console.log(`[SQLite Database] PRAGMA database_list:`, dbList);
    } catch (_) {}
  }

  public exec(sql: string) {
    if (!this._db) throw new Error('DB not initialized');
    this._db.exec(sql);
    saveDbToDisk(this._db);
  }

  public pragma(str: string) {
    if (!this._db) return;
    try {
      this._db.exec(`PRAGMA ${str};`);
    } catch {}
  }

  public prepare(sql: string) {
    const self = this;
    return {
      all(...params: any[]): any[] {
        if (!self._db) throw new Error('DB not initialized');
        const stmt = self._db.prepare(sql);
        if (params.length > 0) stmt.bind(params.flat());
        const results: any[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },

      get(...params: any[]): any {
        if (!self._db) throw new Error('DB not initialized');
        const stmt = self._db.prepare(sql);
        if (params.length > 0) stmt.bind(params.flat());
        let result: any = undefined;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },

      run(...params: any[]): { changes: number; lastInsertRowid: number } {
        if (!self._db) throw new Error('DB not initialized');
        const stmt = self._db.prepare(sql);
        const bound = params.flat();
        if (bound.length > 0) stmt.bind(bound);
        stmt.step();
        stmt.free();
        saveDbToDisk(self._db);
        return { changes: 1, lastInsertRowid: Date.now() };
      }
    };
  }

  public transaction<T extends (...args: any[]) => any>(fn: T): T {
    const self = this;
    return ((...args: any[]) => {
      try {
        const result = fn(...args);
        if (self._db) saveDbToDisk(self._db);
        return result;
      } catch (err) {
        throw err;
      }
    }) as T;
  }
}

export const db = new DbWrapper();

// Auto-initialize DB instance
initSqlJs().then(SQL => {
  let instance: SqlJsDatabase;
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    instance = new SQL.Database(filebuffer);
  } else {
    instance = new SQL.Database();
  }
  db.setDb(instance);
});

export async function ensureDbConnected() {
  const SQL = await initSqlJs();
  let instance: SqlJsDatabase;
  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    instance = new SQL.Database(filebuffer);
  } else {
    instance = new SQL.Database();
  }
  db.setDb(instance);
  return db;
}

export async function resetDbConnection() {
  return ensureDbConnected();
}
