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

/** ค่าจาก dotenv เป็นสตริง — ห้ามใช้ `z.coerce.boolean()` กับ `"false"` เพราะ `Boolean("false") === true` */
function parseEnvBoolean(v: unknown, defaultVal: boolean): boolean {
  if (v === undefined || v === null || v === '') return defaultVal;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return defaultVal;
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
  JWT_ACCESS_TTL_SEC: z.coerce.number().default(900),
  JWT_REFRESH_TTL_SEC: z.coerce.number().default(60 * 60 * 24 * 7),
  HTTP_LOG_ENABLED: z.preprocess((v) => parseEnvBoolean(v, true), z.boolean()),
  AUDIT_LOG_ENABLED: z.preprocess((v) => parseEnvBoolean(v, true), z.boolean()),
  CORS_ORIGINS: z.string().default('*'),
  /**
   * origin เพิ่มเติมสำหรับ Better Auth (คั่นด้วย comma) — ใช้เมื่อ URL แอดมินไม่อยู่ใน CORS_ORIGINS
   * เช่น `https://admin.example.com`
   */
  ADMIN_APP_ORIGINS: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  ABUSE_BLOCK_THRESHOLD: z.coerce.number().default(300),
  ABUSE_BLOCK_TTL_SEC: z.coerce.number().default(3600),
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
  LINE_FLEX_BRAND_NAME: z.string().min(1).default('SKM Easy'),
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
  LEGACY_ACC_CUS_BY_PHONE_SQL: z.string().optional(),
  LEGACY_CONTRACTS_BY_CUSTOMER_SQL: z.string().optional(),
  LEGACY_CONTRACT_DETAIL_SQL: z.string().optional(),
  LEGACY_INSTALLMENTS_BY_CONTRACT_SQL: z.string().optional(),
  LEGACY_RECEIPTS_BY_CUSTOMER_SQL: z.string().optional(),
  LEGACY_LINE_LINK_UPDATE_SQL: z.string().optional(),
  LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL: z.string().optional(),
  LEGACY_MARK_INSTALLMENT_PAID_SQL: z.string().optional(),
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
  OTP_BCRYPT_COST: z.coerce.number().min(4).max(14).default(10),
  OTP_RATE_LIMIT_MAX: z.coerce.number().min(1).default(5),
  OTP_RATE_LIMIT_WINDOW_SEC: z.coerce.number().min(60).default(900),
  OTP_VERIFY_MAX_ATTEMPTS: z.coerce.number().min(3).default(10),
  OTP_VERIFY_LOCK_WINDOW_SEC: z.coerce.number().min(60).default(900),
  /** โฟลเดอร์เก็บไฟล์อัปโหลด CMS (รูปโปรโมชัน / ปกบทความ) — relative จาก cwd */
  UPLOAD_ROOT: z.string().default('data/uploads'),
  /** ขนาดรูปสูงสุดต่อไฟล์ (ไบต์) */
  MAX_UPLOAD_IMAGE_BYTES: z.coerce.number().min(1024).default(8 * 1024 * 1024),
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
