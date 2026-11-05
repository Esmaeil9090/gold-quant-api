import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
      allowExitOnIdle: true,
    });

    global._postgresPool.on('error', (err: any) => {
      const msg = String(err?.message || err || '');
      // Cloud SQL Developer Edition (scale-to-zero) and proxies routinely reclaim idle connections.
      // pg.Pool automatically evicts the closed idle client and reconnects on the next query.
      if (
        msg.includes('Connection terminated unexpectedly') ||
        msg.includes('Client has encountered a connection error') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01'
      ) {
        return;
      }
      console.warn('[GDF Cloud SQL Pool] Non-fatal idle client notice:', msg);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
