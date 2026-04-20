/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: เรียก LINE Login OAuth2 API — แลก authorization code เป็น access token และดึงโปรไฟล์ผู้ใช้
 * - ใช้ในส่วนไหนของระบบ: `auth.service.ts` ตอน callback ล็อกอินด้วย LINE
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `env` (LINE_LOGIN_*)
 *
 * 🔐 โฟลว์ LINE Login (ย่อ):
 * 1) ฝั่ง client เปิดหน้า authorize ของ LINE ได้ `code`
 * 2) server รับ `code` → POST ไป `https://api.line.me/oauth2/v2.1/token` พร้อม client_id/secret/redirect_uri
 * 3) ได้ `access_token` → GET profile → map เป็นผู้ใช้ในระบบเรา
 */
import { env } from '../../core/env/config.js';
import { logger } from '../../core/logger/logger.js';

export type LineTokenResponse = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `code` จาก LINE callback
 * - ทำงานยังไง: ตรวจว่า env ครบ → POST form-urlencoded → parse JSON
 * - return อะไร: `LineTokenResponse` หรือ throw ถ้า HTTP ไม่ ok
 */
export async function exchangeLineAuthorizationCode(code: string): Promise<LineTokenResponse> {
  if (!env.LINE_LOGIN_CHANNEL_ID || !env.LINE_LOGIN_CHANNEL_SECRET || !env.LINE_LOGIN_CALLBACK_URL) {
    throw new Error('LINE login ยังไม่ได้กำหนดค่า');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.LINE_LOGIN_CALLBACK_URL,
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    client_secret: env.LINE_LOGIN_CHANNEL_SECRET,
  });
  const res = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    logger.error('แลก LINE code ล้มเหลว', { status: res.status, t });
    throw new Error('แลกรหัส LINE ไม่สำเร็จ');
  }
  return (await res.json()) as LineTokenResponse;
}

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: access token จากขั้นตอนแลก code
 * - ทำงานยังไง: GET `https://api.line.me/v2/profile` พร้อม Authorization bearer
 * - return อะไร: `LineProfile`
 */
export async function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('ดึงโปรไฟล์ LINE ไม่สำเร็จ');
  }
  return (await res.json()) as LineProfile;
}
