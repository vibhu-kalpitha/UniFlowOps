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

// Synchronous Atomic Disk Export & Write with Windows EPERM Fallback
function saveDbToDiskAtomic(rawDb: SqlJsDatabase): void {
  const data = rawDb.export();
  const buffer = Buffer.from(data);
  const tempPath = `${dbPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  try {
    fs.writeFileSync(tempPath, buffer);
    try {
      fs.renameSync(tempPath, dbPath);
    } catch (renameErr: any) {
      // On Windows, if destination file is locked/open, renameSync throws EPERM/EBUSY.
      // copyFileSync + unlinkSync works on Windows without throwing EPERM.
      fs.copyFileSync(tempPath, dbPath);
    }
  } catch (err) {
    console.error(`[SQLite Persistence Error] Failed to persist database to disk:`, err);
    throw new Error(`Database persistence failure: ${(err as Error).message}`);
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

class DbWrapper {
  private _db: SqlJsDatabase | null = null;
  private _transactionDepth = 0;
  private _initPromise: Promise<SqlJsDatabase> | null = null;

  public async getDb(): Promise<SqlJsDatabase> {
    if (this._db) return this._db;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      const SQL = await initSqlJs();
      let instance: SqlJsDatabase;
      if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        instance = new SQL.Database(filebuffer);
      } else {
        instance = new SQL.Database();
        saveDbToDiskAtomic(instance);
      }
      this._db = instance;
      this._db.exec('PRAGMA foreign_keys = ON;');
      console.log(`[SQLite Database] Single Authoritative Instance Loaded: ${dbPath}`);
      return instance;
    })();

    return this._initPromise;
  }

  public setDb(rawDb: SqlJsDatabase) {
    this._db = rawDb;
    this._db.exec('PRAGMA foreign_keys = ON;');
  }

  public get isInitialized(): boolean {
    return this._db !== null;
  }

  public saveDisk(): void {
    if (!this._db) throw new Error('DB not initialized');
    if (this._transactionDepth === 0) {
      saveDbToDiskAtomic(this._db);
    }
  }

  public exec(sql: string) {
    if (!this._db) throw new Error('DB not initialized');
    this._db.exec(sql);
    if (this._transactionDepth === 0) {
      saveDbToDiskAtomic(this._db);
    }
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
        if (self._transactionDepth === 0) {
          saveDbToDiskAtomic(self._db);
        }
        return { changes: 1, lastInsertRowid: Date.now() };
      }
    };
  }

  public transaction<T extends (...args: any[]) => any>(fn: T): T {
    const self = this;
    return ((...args: any[]) => {
      self._transactionDepth++;
      try {
        const result = fn(...args);
        self._transactionDepth--;
        if (self._transactionDepth === 0 && self._db) {
          saveDbToDiskAtomic(self._db);
        }
        return result;
      } catch (err) {
        self._transactionDepth = Math.max(0, self._transactionDepth - 1);
        throw err;
      }
    }) as T;
  }
}

export const db = new DbWrapper();

export async function ensureDbConnected() {
  await db.getDb();
  return db;
}

export async function resetDbConnection() {
  return ensureDbConnected();
}

// Auto-initialize on import
ensureDbConnected();
