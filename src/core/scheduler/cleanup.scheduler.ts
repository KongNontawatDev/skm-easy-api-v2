/**
 * 📌 ลงทะเบียนงานทำความสะอาดแบบรายชั่วโมงในโปรเซสเดียวกับ HTTP server (ไม่ใช้ Redis/BullMQ)
 */
import { logger } from '../logger/logger.js';
import { runScheduledCleanup } from './cleanup.tasks.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function registerCleanupSchedule(): Promise<void> {
  if (intervalHandle) return;
  const run = async () => {
    try {
      await runScheduledCleanup();
    } catch (err) {
      logger.error('งานทำความสะอาดล้มเหลว', { message: (err as Error).message });
    }
  };
  await run();
  intervalHandle = setInterval(run, 60 * 60 * 1000);
}

export async function enqueueManualCleanup(): Promise<void> {
  await runScheduledCleanup();
}
