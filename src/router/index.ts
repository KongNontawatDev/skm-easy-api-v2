/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: รวม router เวอร์ชัน v1 — ประกอบ public API กับ admin API ใต้ prefix เดียว
 * - ใช้ในส่วนไหนของระบบ: ถูก mount ที่ `app.ts` ภายใต้ `/api/v1`
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `public.router.ts`, `admin.router.ts`, `health.router.ts`
 */
import { Hono } from 'hono';
import { healthRouter } from './health.router.js';
import { buildPublicApiRouter } from './public.router.js';
import { buildAdminApiRouter } from './admin.router.js';
import { adminAuth } from '../features/admin-auth/better-auth.js';
import { buildCmsPublicFilesRouter } from '../features/cms/cms-public-files.router.js';

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: ไม่มี — สร้าง sub-router ใหม่ทุกครั้งที่เรียก
 * - ทำงานยังไง: สร้าง `Hono` ย่อยแล้ว mount public ที่ `/` และ admin ที่ `/admin`
 * - return อะไร: `Hono` instance สำหรับ `/api/v1`
 */
export function buildV1Router() {
  const v1 = new Hono();
  /** Better Auth ใช้ GET/POST เป็นหลัก (รวม `/get-session`) — ตาม [Hono integration](https://www.better-auth.com/docs/integrations/hono) */
  v1.on(['GET', 'POST'], '/admin-auth/*', (c) => adminAuth.handler(c.req.raw));
  v1.route('/public/files', buildCmsPublicFilesRouter());
  // Public: สินค้า, auth, webhooks เข้า, ฯลฯ
  v1.route('/', buildPublicApiRouter());
  // Admin: ต้อง auth + สิทธิ์ staff ตามที่แต่ละ route กำหนด
  v1.route('/admin', buildAdminApiRouter());
  return v1;
}

export { healthRouter };
