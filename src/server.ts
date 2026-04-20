/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: จุดเริ่มต้น (entry point) ของบริการ HTTP — โหลดคอนฟิก ลงทะเบียนงานพื้นฐาน แล้วสตาร์ทเซิร์ฟเวอร์ Hono
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `app.ts`, `cleanup.scheduler.ts` (งานลบไฟล์ชั่วคราวตามเวลา)
 */
import { serve } from '@hono/node-server';
import { env } from './core/env/config.js';
import { logger } from './core/logger/logger.js';

const [{ createApp }, { registerCleanupSchedule }] = await Promise.all([
  import('./app.js'),
  import('./core/scheduler/cleanup.scheduler.js'),
]);

const app = createApp();

try {
  await registerCleanupSchedule();
} catch (err) {
  logger.error('ไม่สามารถลงทะเบียนตารางงาน cleanup ได้', {
    message: (err as Error).message,
  });
  process.exit(1);
}

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: env.HOST,
  },
  (info) => {
    logger.info('เซิร์ฟเวอร์พร้อมรับคำขอ', {
      address: info,
      host: env.HOST,
      port: env.PORT,
      env: env.NODE_ENV,
    });
  },
);
