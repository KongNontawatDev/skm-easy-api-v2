/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: Zod schema สำหรับ body/query ของ auth endpoints (แยกจาก openapi inline เพื่อ reuse)
 * - ใช้ในส่วนไหนของระบบ: import ใน service/controller หรือทดสอบ — บาง route อาจ inline schema ใน `auth.openapi.ts` แทน
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `auth.service.ts`
 */
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const requestOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['login', 'verify_email']),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(['login', 'verify_email']),
});

export const lineCallbackSchema = z.object({
  code: z.string().min(5),
  state: z.string().min(4).optional(),
});
