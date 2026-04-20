/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ห่อการ sign/verify JWT สำหรับ access token และ refresh token
 * - ใช้ในส่วนไหนของระบบ: ระบบล็อกอิน (`auth.service.ts`) และ `auth.middleware.ts` (verify access)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `core/env/config.ts` (secrets + TTL), `request-context.ts` (รูปแบบ principal)
 *
 * 🔐 โฟลว์ JWT (แนวคิด):
 * - Access token: อายุสั้น เก็บ roles/permissions snapshot ใน payload — แต่ middleware ยัง hydrate จาก DB เพื่อความเป็นปัจจุบัน
 * - Refresh token: อายุยาว มี claim `typ: 'refresh'` — ใช้แลก access ใหม่ได้เมื่อ access หมดอายุ
 */
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_TTL_SEC, JWT_REFRESH_TTL_SEC } from '../constants.js';
import { env } from '../env/config.js';
import type { AuthPrincipal } from '../http/request-context.js';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  customerPhone?: string;
};

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `principal` (ผู้ใช้ + roles + permissions), `ttlSec` ออปชัน
 * - ทำงานยังไง: สร้าง payload แล้ว `jwt.sign` ด้วย HS256 และ secret ของ access
 * - return อะไร: สตริง JWT
 */
export function signAccessToken(principal: AuthPrincipal, ttlSec = JWT_ACCESS_TTL_SEC) {
  const payload: AccessTokenPayload = {
    sub: principal.id,
    email: principal.email,
    roles: principal.roles,
    permissions: principal.permissions,
    ...(principal.customerPhone ? { customerPhone: principal.customerPhone } : {}),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: ttlSec });
}

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `userId`, `ttlSec` ออปชัน
 * - ทำงานยังไง: sign ด้วย secret คนละตัวกับ access และใส่ `typ: 'refresh'` เพื่อกันนำไปใช้แทน access
 * - return อะไร: สตริง JWT refresh
 */
export function signRefreshToken(userId: string, ttlSec = JWT_REFRESH_TTL_SEC) {
  return jwt.sign({ sub: userId, typ: 'refresh' }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: ttlSec,
  });
}

/** refresh ลูกค้าแอป — ผูกกับ LINE user id เพื่อรองรับหลายเครื่อง/หลายบัญชีไลน์ต่อ 1 ลูกค้า */
export function signCustomerRefreshToken(legacyCustomerId: string, lineUserId: string, ttlSec: number) {
  return jwt.sign({ sub: legacyCustomerId, typ: 'refresh', lid: lineUserId }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: ttlSec,
  });
}

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: สตริง bearer token (ไม่รวมคำว่า Bearer)
 * - ทำงานยังไง: `jwt.verify` จำกัด algorithm HS256 แล้ว map เป็น `AccessTokenPayload`
 * - return อะไร: payload ที่มี sub/email/roles/permissions
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload & AccessTokenPayload;
  return {
    sub: decoded.sub,
    email: decoded.email,
    roles: decoded.roles ?? [],
    permissions: decoded.permissions ?? [],
    customerPhone: typeof decoded.customerPhone === 'string' ? decoded.customerPhone : undefined,
  };
}

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: สตริง refresh token
 * - ทำงานยังไง: verify ด้วย secret ของ refresh แล้วตรวจว่า `typ === 'refresh'`
 * - return อะไร: `{ sub: userId }` — ถ้าไม่ใช่ refresh จะ throw
 */
export function verifyRefreshToken(token: string): { sub: string; lid?: string } {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;
  if (decoded.typ !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  const lid = typeof decoded.lid === 'string' && decoded.lid.length > 0 ? decoded.lid : undefined;
  return { sub: String(decoded.sub), lid };
}
