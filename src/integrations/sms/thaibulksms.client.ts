/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - เชื่อม Thai Bulk SMS: **OTP Application** (`otp.thaibulksms.com/v2/otp/*`, body key/secret/…)
 * - ทางเลือก **API v2 ส่งข้อความ** (`api-v2.thaibulksms.com/sms`, Basic Auth + sender)
 *
 * @see https://developer.thaibulksms.com/reference/post_sms
 */
import { env } from '../../core/env/config.js';
import { badRequest, serviceUnavailable } from '../../core/http/errors.js';

const SMS_URL = 'https://api-v2.thaibulksms.com/sms';
const DEFAULT_OTP_REQUEST_URL = 'https://otp.thaibulksms.com/v2/otp/request';
const DEFAULT_OTP_VERIFY_URL = 'https://otp.thaibulksms.com/v2/otp/verify';

/** prefix เก็บใน `otp_verifications.otp_code` เมื่อใช้ Thai Bulk OTP API (ไม่เก็บ PIN ในเซิร์ฟเวอร์) */
export const THAIBULK_PROVIDER_OTP_PREFIX = 'TBS:';

function parseThaiBulkOtpErrorMessage(text: string): string {
  try {
    const j = JSON.parse(text) as { errors?: { message?: string }[]; message?: string };
    const m = j.errors?.[0]?.message ?? j.message;
    if (typeof m === 'string' && m.length > 0) return m;
  } catch {
    /* ignore */
  }
  return text.slice(0, 240);
}

function readOtpJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw serviceUnavailable('Thai Bulk OTP ตอบกลับไม่ใช่ JSON');
  }
}

/**
 * ขอ OTP จาก Thai Bulk (ส่ง SMS โดยผู้ให้บริการ — เก็บ `token` ไว้ verify ภายหลัง)
 */
export async function requestThaiBulkSmsOtp(msisdn: string): Promise<{ token: string; refno: string }> {
  const key = env.THAIBULKSMS_API_KEY;
  const secret = env.THAIBULKSMS_API_SECRET;
  if (!key || !secret) {
    throw serviceUnavailable('ยังไม่ตั้งค่า THAIBULKSMS_API_KEY / THAIBULKSMS_API_SECRET');
  }
  const url = env.THAIBULKSMS_OTP_REQUEST_URL ?? DEFAULT_OTP_REQUEST_URL;
  const body = new URLSearchParams({ key, secret, msisdn });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  const data = readOtpJson(text);
  if (!res.ok) {
    const errMsg = parseThaiBulkOtpErrorMessage(text);
    if (res.status >= 500) {
      throw serviceUnavailable(`Thai Bulk OTP request ชั่วคราวไม่พร้อม (${res.status}): ${errMsg}`);
    }
    throw badRequest(`Thai Bulk OTP request ไม่สำเร็จ (${res.status}): ${errMsg}`);
  }
  if (data.status !== 'success' || typeof data.token !== 'string' || typeof data.refno !== 'string') {
    throw badRequest(`Thai Bulk OTP request ตอบกลับไม่คาดหมาย: ${text.slice(0, 200)}`);
  }
  return { token: data.token, refno: data.refno };
}

/**
 * ยืนยัน PIN กับ Thai Bulk — คืน `true` เมื่อถูกต้อง, `false` เมื่อรหัสผิด/หมดอายุ (HTTP 400)
 */
export async function verifyThaiBulkSmsOtp(params: { token: string; pin: string }): Promise<boolean> {
  const key = env.THAIBULKSMS_API_KEY;
  const secret = env.THAIBULKSMS_API_SECRET;
  if (!key || !secret) {
    throw serviceUnavailable('ยังไม่ตั้งค่า THAIBULKSMS_API_KEY / THAIBULKSMS_API_SECRET');
  }
  const url = env.THAIBULKSMS_OTP_VERIFY_URL ?? DEFAULT_OTP_VERIFY_URL;
  const body = new URLSearchParams({ key, secret, token: params.token, pin: params.pin.trim() });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  const data = readOtpJson(text);
  if (res.ok) {
    if (data.status === 'success') return true;
    throw badRequest(`Thai Bulk OTP verify ตอบกลับไม่คาดหมาย: ${text.slice(0, 200)}`);
  }
  const errMsg = parseThaiBulkOtpErrorMessage(text);
  if (res.status === 400 && errMsg === 'Code is invalid.') return false;
  if (res.status >= 500) {
    throw serviceUnavailable(`Thai Bulk OTP verify ชั่วคราวไม่พร้อม (${res.status}): ${errMsg}`);
  }
  throw badRequest(`Thai Bulk OTP verify ไม่สำเร็จ (${res.status}): ${errMsg}`);
}

export async function sendThaiBulkSms(msisdn: string, message: string): Promise<void> {
  const key = env.THAIBULKSMS_API_KEY;
  const secret = env.THAIBULKSMS_API_SECRET;
  const sender = env.THAIBULKSMS_SENDER;
  if (!key || !secret || !sender) {
    throw serviceUnavailable('ยังไม่ตั้งค่า THAIBULKSMS_API_KEY / THAIBULKSMS_API_SECRET / THAIBULKSMS_SENDER');
  }
  const body = new URLSearchParams({ msisdn, message, sender });
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(SMS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw badRequest(`ThaiBulkSMS ตอบกลับไม่สำเร็จ (${res.status}): ${text.slice(0, 200)}`);
  }
}
