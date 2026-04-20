/**
 * 📌 อธิบายไฟล์นี้:
 * - โหลดตัวแปรสภาพแวดล้อมจากไฟล์ `.env*` แล้ว parse/validate ด้วย Zod
 */
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFileCandidates = [
  process.env.DOTENV_PATH,
  process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev',
  '.env',
].filter(Boolean) as string[];

for (const file of envFileCandidates) {
  const full = resolve(process.cwd(), file);
  if (existsSync(full)) {
    loadEnv({ path: full });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  /** origin ของ API สำหรับ Better Auth (แอดมิน) — ถ้าไม่ตั้ง ใน dev จะใช้ `http://127.0.0.1:<PORT>` */
  BETTER_AUTH_URL: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().url().optional(),
  ),
  /** ถ้าไม่ตั้ง ระบบจะใช้ `JWT_ACCESS_SECRET` แทน */
  BETTER_AUTH_SECRET: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().min(32).optional(),
  ),
  CORS_ORIGINS: z.string().default('*'),
  /**
   * origin เพิ่มเติมสำหรับ Better Auth (คั่นด้วย comma) — ใช้เมื่อ URL แอดมินไม่อยู่ใน CORS_ORIGINS
   * เช่น `https://admin.example.com`
   */
  ADMIN_APP_ORIGINS: z.string().default(''),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_LOGIN_CHANNEL_ID: z.string().optional(),
  LINE_LOGIN_CHANNEL_SECRET: z.string().optional(),
  LINE_LOGIN_CALLBACK_URL: z.string().url().optional(),
  LINE_FLEX_HERO_IMAGE_URL: z.string().url().optional(),
  LINE_LIFF_INVOICE_URL: z.string().url().optional(),
  LINE_LIFF_RECEIPT_URL: z.string().url().optional(),
  /**
   * API key ถาวรสำหรับ `POST /integrations/installment-notify` — ส่งใน header `X-Api-Key`
   * (ถ้าไม่ตั้งจะใช้ `INSTALLMENT_INTEGRATION_SECRET` แทนเพื่อความเข้ากันได้กับของเดิม)
   */
  INSTALLMENT_POSTING_API_KEY: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().min(16).optional(),
  ),
  /** @deprecated ใช้ INSTALLMENT_POSTING_API_KEY + header X-Api-Key แทน */
  INSTALLMENT_INTEGRATION_SECRET: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().min(16).optional(),
  ),
  ADMIN_NOTIFY_EMAIL: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().email().optional(),
  ),
  /** โฟลเดอร์ไฟล์ `.sql` สำหรับ legacy (สัมพัทธ์จาก cwd) — ดู `config/legacy-sql/` */
  LEGACY_SQL_DIR: z.string().min(1).default('config/legacy-sql'),
  THAIBULKSMS_API_KEY: z.string().optional(),
  THAIBULKSMS_API_SECRET: z.string().optional(),
  THAIBULKSMS_SENDER: z.string().optional(),
  /**
   * `provider` — ใช้ SMS OTP Application (POST otp.thaibulksms.com key/secret/msisdn) ตรงกับคีย์ใน OTP Manager
   * `sms` — สร้างรหัสในเซิร์ฟเวอร์แล้วส่งข้อความผ่าน API v2 `/sms` (ต้องมี THAIBULKSMS_SENDER)
   */
  THAIBULKSMS_OTP_STRATEGY: z.enum(['provider', 'sms']).default('provider'),
  THAIBULKSMS_OTP_REQUEST_URL: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().url().optional(),
  ),
  THAIBULKSMS_OTP_VERIFY_URL: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().url().optional(),
  ),
  /** รายการ msisdn (คั่นด้วย comma) ที่ห้ามส่ง OTP — รวม 66899999999 เสมอ */
  THAIBULKSMS_BLOCKED_MSISDNS: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : v),
    z.string().optional(),
  ),
});

export type AppConfig = z.infer<typeof envSchema> & {
  /** ค่าจริงที่ใช้กับ Better Auth (มาจาก BETTER_AUTH_SECRET หรือ JWT_ACCESS_SECRET) */
  BETTER_AUTH_SECRET: string;
  /** origin ของ API สำหรับ Better Auth — มีค่าเสมอหลัง merge */
  BETTER_AUTH_URL: string;
};

const parsed = envSchema.parse(process.env);

const betterAuthUrl =
  parsed.BETTER_AUTH_URL ??
  (parsed.NODE_ENV !== 'production'
    ? `http://127.0.0.1:${parsed.PORT}`
    : (() => {
        throw new Error('ต้องตั้ง BETTER_AUTH_URL ใน production (origin ของ API เช่น https://api.example.com)');
      })());

export const env: AppConfig = {
  ...parsed,
  BETTER_AUTH_URL: betterAuthUrl,
  BETTER_AUTH_SECRET: parsed.BETTER_AUTH_SECRET ?? parsed.JWT_ACCESS_SECRET,
};

export const isProd = env.NODE_ENV === 'production';
