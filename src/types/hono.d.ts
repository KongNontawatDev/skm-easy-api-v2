/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ขยาย module augmentation ของ Hono เพื่อให้ `c.get('requestId'|'auth')` มี type ที่ถูกต้อง
 * - ใช้ในส่วนไหนของระบบ: TypeScript compile time ทั้งโปรเจกต์
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `request-context.ts`, middleware ที่ `c.set(...)`
 */
import type { AuthPrincipal } from '../core/http/request-context.js';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
    auth?: AuthPrincipal;
  }
}
