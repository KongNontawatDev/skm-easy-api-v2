/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: นิยามชนิดตัวแปร context ของ Hono (`Variables`) — ข้อมูลที่ middleware ใส่เข้าไปในแต่ละ request
 * - ใช้ในส่วนไหนของระบบ: ใช้ร่วมกับ `AppVariables` ในการ type-safe ของ `c.get('auth')`, `c.get('requestId')` ฯลฯ
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `types/hono.d.ts` (ถ้ามีการขยาย), `auth.middleware.ts`
 */
import type { UserRow } from '../../features/auth/auth.repo.js';

export type AuthPrincipal = Pick<UserRow, 'id' | 'email' | 'isActive'> & {
  roles: string[];
  permissions: string[];
  /** เบอร์ลูกค้า (มีเมื่อ JWT จาก OTP แอปลูกค้า) */
  customerPhone?: string;
};

export type AppVariables = {
  requestId: string;
  auth?: AuthPrincipal;
};
