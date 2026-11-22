import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: { query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>> }) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isPGlite: boolean;
}

let dbInstance: DbClient | null = null;

export async function getDbClient(): Promise<DbClient> {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = process.env.DATABASE_URL;

  // Try connecting to standard PostgreSQL server first
  if (connectionString) {
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2000,
    });

    try {
      const res = await pool.query('SELECT 1 as connected');
      if (res.rows[0]?.connected === 1) {
        dbInstance = {
          query: async (text: string, params?: any[]) => {
            const result = await pool.query(text, params);
            return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
          },
          transaction: async (fn) => {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              const tx = {
                query: async (text: string, params?: any[]) => {
                  const result = await client.query(text, params);
                  return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
                },
              };
              const res = await fn(tx);
              await client.query('COMMIT');
              return res;
            } catch (e) {
              await client.query('ROLLBACK').catch(() => {});
              throw e;
            } finally {
              client.release();
            }
          },
          close: async () => {
            await pool.end();
          },
          isPGlite: false,
        };
        console.log(' Connected to PostgreSQL server on 5432.');
        return dbInstance;
      }
    } catch (err: any) {
      console.warn('⚠️ Standard PostgreSQL server connection failed/timed out.');
      console.warn('   Falling back to persistent embedded PostgreSQL (PGlite)...');
      await pool.end().catch(() => {});
    }
  }

  // Fallback to embedded PostgreSQL engine (PGlite)
  const { PGlite } = await import('@electric-sql/pglite');
  // Fixed path regardless of current working directory
  const dataDir = path.resolve(__dirname, '..', '..', 'data', 'pgdata');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  dbInstance = {
    query: async (text: string, params?: any[]) => {
      const result = await pglite.query(text, params);
      return { rows: result.rows as any[], rowCount: result.rows.length };
    },
    transaction: async (fn) => {
      await pglite.query('BEGIN');
      try {
        const tx = {
          query: async (text: string, params?: any[]) => {
            const result = await pglite.query(text, params);
            return { rows: result.rows as any[], rowCount: result.rows.length };
          },
        };
        const res = await fn(tx);
        await pglite.query('COMMIT');
        return res;
      } catch (e) {
        await pglite.query('ROLLBACK').catch(() => {});
        throw e;
      }
    },
    close: async () => {
      await pglite.close();
    },
    isPGlite: true,
  };

  console.log(` Connected to persistent PostgreSQL (PGlite) engine at ${dataDir}`);
  return dbInstance;
}
