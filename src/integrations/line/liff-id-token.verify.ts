/**
 * ตรวจสอบ LIFF id_token กับ LINE — ได้ `sub` เป็น LINE user id
 * @see https://developers.line.biz/en/reference/line-login/#verify-id-token
 */
import { env } from '../../core/env/config.js';
import { badRequest, unauthorized } from '../../core/http/errors.js';

type LineVerifyResponse = {
  sub?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  /** ชื่อที่แสดง — มีใน token เมื่อขอ scope profile/openid ตาม LINE */
  name?: string;
  /** URL รูปโปรไฟล์ */
  picture?: string;
  error?: string;
  error_description?: string;
};

export type LiffIdTokenProfile = {
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
};

/** ตรวจ id_token กับ LINE — ได้ LINE user id และชื่อ/รูป (ถ้ามีใน token) */
export async function verifyLiffIdTokenProfile(idToken: string): Promise<LiffIdTokenProfile> {
  const clientId = env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (!clientId) {
    throw badRequest('เซิร์ฟเวอร์ยังไม่ตั้ง LINE_LOGIN_CHANNEL_ID');
  }
  const body = new URLSearchParams();
  body.set('id_token', idToken);
  body.set('client_id', clientId);

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as LineVerifyResponse;
  if (!res.ok || json.error) {
    throw unauthorized(json.error_description ?? json.error ?? 'id_token ไม่ถูกต้อง');
  }
  const sub = json.sub?.trim();
  if (!sub) throw unauthorized('ไม่พบ LINE user id จาก id_token');
  const displayName = typeof json.name === 'string' && json.name.trim() ? json.name.trim() : undefined;
  const pictureUrl = typeof json.picture === 'string' && json.picture.trim() ? json.picture.trim() : undefined;
  return { lineUserId: sub, displayName, pictureUrl };
}

export async function verifyLiffIdToken(idToken: string): Promise<string> {
  const p = await verifyLiffIdTokenProfile(idToken);
  return p.lineUserId;
}
