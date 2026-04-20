/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ตั้งค่า Winston logger หลัก (`logger`) และช่อง audit (`auditLogger`) พร้อม redact ข้อมูลอ่อนไหวใน meta
 * - ใช้ในส่วนไหนของระบบ: ทุกที่ที่ต้องบันทึกเหตุการณ์ HTTP, error, การกระทำสำคัญของผู้ใช้/แอดมิน
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `core/env/config.ts` (ระดับ log), `features/audit/audit.service.ts` (อาจเขียน audit แยก)
 *
 * 🛡 หมายเหตุความปลอดภัย:
 * - ห้าม log โทเคน/รหัสผ่าน — ฟังก์ชัน `redactMeta` จะซ่อนคีย์ที่น่าสงสัยแบบ recursive
 */
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../env/config.js';

const logsDir = resolve(process.cwd(), 'logs');
mkdirSync(logsDir, { recursive: true });

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'otp',
  'otpcode',
  'refcode',
  'code',
  'secret',
  'accesstoken',
  'refreshtoken',
]);

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `meta` เป็น object ของข้อมูลเสริมที่จะเขียนลง log
 * - ทำงานยังไง: วนทุก key — ถ้าชื่อคีย์อยู่ใน `SENSITIVE_KEYS` จะแทนที่ด้วย `[REDACTED]`; ถ้าเป็น object ซ้อน จะเรียก recursive
 * - return อะไร: object ใหม่ที่ปลอดภัยขึ้นสำหรับเก็บใน log file/console
 */
function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactMeta(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out;
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const { message, level, timestamp, stack, ...meta } = info;
    return { message, level, timestamp, stack, ...redactMeta(meta as Record<string, unknown>) };
  })(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${String(timestamp)} [${level}] ${String(message)}${rest}`;
  }),
);

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `name` prefix ของไฟล์ log รายวัน
 * - ทำงานยังไง: สร้าง transport แบบหมุนไฟล์ + zip + เก็บย้อนหลัง 14 วัน
 * - return อะไร: instance ของ `DailyRotateFile`
 */
const dailyRotate = (name: string) =>
  new DailyRotateFile({
    dirname: logsDir,
    filename: `${name}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    zippedArchive: true,
  });

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'skm-easy-api' },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production' ? jsonFormat : consoleFormat,
    }),
    new winston.transports.File({
      filename: resolve(logsDir, 'combined.log'),
      format: jsonFormat,
    }),
    dailyRotate('app'),
  ],
});

export const auditLogger = winston.createLogger({
  level: 'info',
  defaultMeta: { channel: 'audit' },
  transports: [
    new winston.transports.File({
      filename: resolve(logsDir, 'audit.log'),
      format: jsonFormat,
    }),
    dailyRotate('audit'),
  ],
});
