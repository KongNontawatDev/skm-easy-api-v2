/**
 * Connection pool MySQL/MariaDB ผ่าน mysql2 (raw SQL เท่านั้น)
 * เก็บชื่อ `prisma` + เมธอด `$queryRawUnsafe` / `$executeRawUnsafe` เพื่อให้โค้ดเดิมเรียกแบบเดิมได้
 */
import { createPool, type Pool, type ResultSetHeader } from 'mysql2/promise';
import { env } from '../env/config.js';

const globalForPool = globalThis as unknown as { __skmMysqlPool?: Pool };

export const pool: Pool =
  globalForPool.__skmMysqlPool ??
  createPool({
    uri: env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 20_000,
    enableKeepAlive: true,
  });

if (env.NODE_ENV !== 'production') {
  globalForPool.__skmMysqlPool = pool;
}

export const prisma = {
  async $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T> {
    const [rows] = await pool.query(sql, params);
    return rows as T;
  },

  async $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number> {
    const [res] = await pool.execute(sql, params);
    return (res as ResultSetHeader).affectedRows;
  },

  async $disconnect(): Promise<void> {
    await pool.end();
  },
};
