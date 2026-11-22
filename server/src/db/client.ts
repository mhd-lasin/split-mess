import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load server/.env first, then fallback to workspace root .env (without overriding existing env vars)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

function parsePostgresConnection(connectionString: string): {
  effectiveConnectionString: string;
  isRemote: boolean;
  sslOption?: { rejectUnauthorized: boolean };
} {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const isRemote = host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    const sslDisabled = sslMode === 'disable';

    if (isRemote && !sslDisabled) {
      const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
      // Strip sslmode from the URL when applying an explicit ssl object so pg-connection-string does not overwrite it
      if (!rejectUnauthorized && parsed.searchParams.has('sslmode')) {
        parsed.searchParams.delete('sslmode');
      }
      return {
        effectiveConnectionString: parsed.toString(),
        isRemote,
        sslOption: { rejectUnauthorized },
      };
    }

    return {
      effectiveConnectionString: connectionString,
      isRemote,
    };
  } catch {
    return {
      effectiveConnectionString: connectionString,
      isRemote: false,
    };
  }
}

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
  const isProd = process.env.NODE_ENV === 'production';

  // Try connecting to standard PostgreSQL server first
  if (connectionString) {
    const { effectiveConnectionString, isRemote, sslOption } = parsePostgresConnection(connectionString);
    const pool = new Pool({
      connectionString: effectiveConnectionString,
      connectionTimeoutMillis: isProd || isRemote ? 15000 : 2500,
      ...(sslOption ? { ssl: sslOption } : {}),
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
        console.log(`✅ Connected to PostgreSQL server (${isRemote ? 'remote/cloud' : 'local'}).`);
        return dbInstance;
      }
    } catch (err: any) {
      await pool.end().catch(() => {});
      if (isProd && process.env.ALLOW_PGLITE_IN_PROD !== 'true') {
        console.error('❌ Production PostgreSQL connection failed:', err.message);
        throw err;
      }
      console.warn('⚠️ Standard PostgreSQL server connection failed/timed out.');
      console.warn('   Falling back to persistent embedded PostgreSQL (PGlite)...');
    }
  } else if (isProd && process.env.ALLOW_PGLITE_IN_PROD !== 'true') {
    throw new Error('FATAL: DATABASE_URL must be set in production.');
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
