import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.dev') });
const phone = process.argv[2];
if (!phone) {
  console.error('ใช้: npx tsx scripts/get-last-otp.ts <เบอร์ 10 หลัก> [refCode]');
  process.exit(1);
}
const refCode = process.argv[3];
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
const { prisma } = await import('../src/core/db/client.js');
type Row = { otpCode: string };
const rows = refCode
  ? await prisma.$queryRawUnsafe<Row[]>(
      'SELECT `otp_code` AS otpCode FROM `otp_verifications` WHERE `phone` = ? AND `ref_code` = ? ORDER BY `created_at` DESC LIMIT 1',
      phone,
      refCode,
    )
  : await prisma.$queryRawUnsafe<Row[]>(
      'SELECT `otp_code` AS otpCode FROM `otp_verifications` WHERE `phone` = ? ORDER BY `created_at` DESC LIMIT 1',
      phone,
    );
const r = rows[0];
const code = r?.otpCode ?? '';
if (code.startsWith('TBS:')) {
  process.stderr.write(
    'otp_code เป็น token ของ Thai Bulk OTP API — ดูรหัสใน SMS ของเบอร์นี้ (ไม่เก็บ PIN ใน DB)\n',
  );
  process.stdout.write('');
} else if (code.startsWith('$2')) {
  process.stderr.write(
    'otp_code ถูกเก็บเป็น bcrypt hash แล้ว — ดูรหัสจาก SMS (โหมด sms) หรือใช้แถว TBS: กับ Thai Bulk OTP\n',
  );
  process.stdout.write('');
} else {
  process.stdout.write(String(code));
}
await prisma.$disconnect();
