/**
 * เบอร์มือถือไทยสำหรับ OTP / Thai Bulk (`msisdn` = 66 + 9 หลักหลัง 0)
 * ใช้ร่วมกับ `customer-auth` เพื่อให้ปลายทาง SMS ตรงกับที่ผู้ใช้กรอกเสมอ
 */

/** รูปแบบ 10 หลัก ขึ้นต้น 0 แล้วตามด้วย 6 / 8 / 9 (มือถือไทยทั่วไป) */
export const THAI_LOCAL_MOBILE_REGEX = /^0[689]\d{8}$/;

const DEFAULT_BLOCKED_MSISDNS = ['66899999999'] as const;

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/** แปลงอินพุตผู้ใช้เป็นเลข 10 หลักขึ้นต้น 0 (ยังไม่ตรวจว่าเป็นมือถือจริง) */
export function toLocalThaiMobileDigits(input: string): string {
  const d = digitsOnly(input);
  if (d.length === 10 && d.startsWith('0')) return d;
  if (d.length === 11 && d.startsWith('66')) return `0${d.slice(2)}`;
  if (d.length === 12 && d.startsWith('668')) return `0${d.slice(3)}`;
  return d;
}

export function toThaiBulkMsisdnFromLocal(local10: string): string {
  if (local10.length !== 10 || !local10.startsWith('0')) {
    throw new Error('toThaiBulkMsisdnFromLocal: ต้องเป็นเบอร์ 10 หลักขึ้นต้น 0');
  }
  return `66${local10.slice(1)}`;
}

export type ParsedCustomerPhone =
  | { ok: true; local: string; msisdn: string }
  | { ok: false; message: string };

/** แปลง + ตรวจว่าเป็นเบอร์มือถือไทยที่ใช้ส่ง SMS ได้ */
export function parseCustomerThaiMobile(phoneRaw: string): ParsedCustomerPhone {
  const local = toLocalThaiMobileDigits(phoneRaw);
  if (local.length !== 10) {
    return { ok: false, message: 'รูปแบบเบอร์โทรไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก' };
  }
  if (!THAI_LOCAL_MOBILE_REGEX.test(local)) {
    return {
      ok: false,
      message: 'รูปแบบเบอร์โทรไม่ถูกต้อง — ต้องเป็นเบอร์มือถือที่ขึ้นต้น 06 / 08 / 09',
    };
  }
  return { ok: true, local, msisdn: toThaiBulkMsisdnFromLocal(local) };
}

/** รวมเบอร์ที่ห้ามส่ง OTP จริง (เช่นเบอร์จำลอง) — ใช้ใน production และ dev */
export function buildBlockedThaiBulkMsisdns(envCsv?: string): Set<string> {
  const s = new Set<string>([...DEFAULT_BLOCKED_MSISDNS]);
  if (envCsv?.trim()) {
    for (const part of envCsv.split(',')) {
      const n = digitsOnly(part);
      if (n.length >= 11 && n.startsWith('66')) s.add(n);
    }
  }
  return s;
}

export function isBlockedThaiBulkMsisdn(msisdn: string, blocked: Set<string>): boolean {
  return blocked.has(digitsOnly(msisdn));
}
