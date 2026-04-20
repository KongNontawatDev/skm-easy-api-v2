/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ตั้งค่า HTTP security headers (เช่น X-Content-Type-Options) ผ่าน middleware ของ Hono
 * - ใช้ในส่วนไหนของระบบ: ครอบทุก request ใน `app.ts`
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `hono/secure-headers` เท่านั้น — ไม่มี business logic
 *
 * ⚠️ ปิด `crossOriginEmbedderPolicy` เพื่อไม่ให้กระทบการฝัง iframe/บาง integration — ถ้าต้องการ hardening เพิ่ม ต้องทดสอบ UI ที่เกี่ยวข้อง
 *
 * ⚠️ ปิด `crossOriginResourcePolicy` — ค่าเริ่มต้นของ hono คือ `same-origin` ทำให้รูป CMS ที่ `GET /api/v1/public/files/*`
 * โหลดไม่ได้เมื่อแอดมิน/แอปรันคนละพอร์ตหรือคนละโดเมนกับ API (`<img src>` เป็น cross-origin)
 */
import { secureHeaders } from 'hono/secure-headers';

/** หัวข้อความปลอดภัยแบบเดียวกับ Helmet ที่เคยปิด CSP/COEE — ใช้ middleware ของ Hono ที่เข้ากับ Web Response */
export const helmetMiddleware = secureHeaders({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
});
