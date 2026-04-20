/**
 * สถานะสุขภาพระบบ — DB
 */
import { prisma } from '../db/client.js';

export type HealthStatus = 'ok' | 'error';

export type HealthReport = {
  status: HealthStatus;
  uptimeSec: number;
  checks: {
    server: HealthStatus;
    database: HealthStatus;
  };
  error?: string;
};

const startedAt = Date.now();

function appendError(prev: string | undefined, label: string, message: string): string {
  const piece = `${label}: ${message}`;
  return prev ? `${prev}; ${piece}` : piece;
}

export async function getHealthReport(): Promise<HealthReport> {
  const checks = {
    server: 'ok' as HealthStatus,
    database: 'error' as HealthStatus,
  };
  let error: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (e) {
    error = appendError(error, 'database', (e as Error).message);
  }

  const status: HealthStatus = checks.database === 'ok' ? 'ok' : 'error';

  return {
    status,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    checks,
    error,
  };
}
