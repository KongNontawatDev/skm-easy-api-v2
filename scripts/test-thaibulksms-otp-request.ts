/**
 * ทดสอบเรียก Thai Bulk OTP request โดยตรง (ไม่ผ่าน API แอป)
 *
 * ใช้: npx tsx scripts/test-thaibulksms-otp-request.ts 66812345678
 * ต้องมี THAIBULKSMS_API_KEY / THAIBULKSMS_API_SECRET ใน .env.dev
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.dev') });

const raw = process.argv[2];
if (!raw) {
  console.error('ใช้: npx tsx scripts/test-thaibulksms-otp-request.ts <เบอร์ เช่น 0812345678 หรือ 66812345678>');
  process.exit(1);
}
const d = raw.replace(/\D/g, '');
const normalized =
  d.length === 10 && d.startsWith('0')
    ? `66${d.slice(1)}`
    : d.length === 11 && d.startsWith('66')
      ? d
      : d.length === 12 && d.startsWith('668')
        ? d
        : d;
if (!/^66[0-9]{9,10}$/.test(normalized)) {
  console.error('รูปแบบเบอร์ไม่ถูกต้อง — ใช้เบอร์ไทย 10 หลักหรือรูปแบบ 66xxxxxxxxx');
  process.exit(1);
}
const key = process.env.THAIBULKSMS_API_KEY;
const secret = process.env.THAIBULKSMS_API_SECRET;
if (!key || !secret) {
  console.error('ไม่พบ THAIBULKSMS_API_KEY / THAIBULKSMS_API_SECRET ใน .env.dev');
  process.exit(1);
}

const url = process.env.THAIBULKSMS_OTP_REQUEST_URL ?? 'https://otp.thaibulksms.com/v2/otp/request';
const body = new URLSearchParams({ key, secret, msisdn: normalized });

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const text = await res.text();
console.log('HTTP', res.status);
let parsed: Record<string, unknown>;
try {
  parsed = JSON.parse(text) as Record<string, unknown>;
} catch {
  console.log(text.slice(0, 500));
  process.exit(res.ok ? 0 : 1);
}
console.log('status field', parsed.status);
console.log('refno', parsed.refno);
console.log('token length', typeof parsed.token === 'string' ? (parsed.token as string).length : 0);
if (!res.ok || parsed.status !== 'success') {
  console.log('body', text.slice(0, 500));
  process.exit(1);
}
