/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - OTP ล็อกอินลูกค้าแอป (เบอร์ไทย) + ออก JWT แบบ role customer
 * - ผูกกับแถว legacy ผ่าน SQL ใน env (ไม่สร้าง User ใน Prisma)
 *
 * 🔐 ความปลอดภัย
 * - โหมด `THAIBULKSMS_OTP_STRATEGY=provider`: Thai Bulk ส่ง SMS + เก็บ `TBS:<token>` ใน DB (ไม่เก็บ PIN)
 * - โหมด `sms`: เก็บ OTP เป็น bcrypt hash (ไม่เก็บ plaintext) + ส่งข้อความผ่าน `/sms`
 * - รหัส SMS สำหรับลูกค้าเป็น **ตัวเลข 4 หลัก** (โหมด `sms` เท่านั้น — ส่ง SMS จริงทุกครั้ง)
 * - Rate limit ขอ OTP + จำกัดความพยายาม verify ผิด (in-memory ต่อโปรเซส)
 */
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { env } from '../../core/env/config.js';
import { badRequest, tooManyRequests, unauthorized } from '../../core/http/errors.js';
import { refreshCustomerSession } from './customer-liff.service.js';
import { redis } from '../../core/security/redis.client.js';
import {
  requestThaiBulkSmsOtp,
  sendThaiBulkSms,
  THAIBULK_PROVIDER_OTP_PREFIX,
  verifyThaiBulkSmsOtp,
} from '../../integrations/sms/thaibulksms.client.js';
import {
  buildBlockedThaiBulkMsisdns,
  isBlockedThaiBulkMsisdn,
  parseCustomerThaiMobile,
} from '../../core/phone/thai-mobile.js';
import { findCustomerByPhone, linkLineProfile } from '../legacy-sql/legacy-sql.service.js';
import { verifyLiffIdTokenProfile } from '../../integrations/line/liff-id-token.verify.js';
import {
  createCustomerLiffLink,
  countLinksForCustomer,
  issueCustomerTokens,
  type CustomerLiffLinkRow,
} from './customer-liff.service.js';
import type { AuthPrincipal } from '../../core/http/request-context.js';

const blockedThaiBulkMsisdns = buildBlockedThaiBulkMsisdns(env.THAIBULKSMS_BLOCKED_MSISDNS);

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** ไดรเวอร์ MariaDB/mysql บางตัวคืนชื่อคอลัมน์เป็น lowercase — จับคู่แบบไม่สนตัวพิมพ์ */
function legacyField(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const direct = row[name];
    if (direct !== undefined && direct !== null) return direct;
  }
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === target);
    if (hit !== undefined) {
      const v = row[hit];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

function nationalIdFromLegacyRow(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  const raw = legacyField(row, ['IDNO', 'idno', 'nationalId', 'NATIONAL_ID']);
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'bigint') {
    const d = raw.toString().replace(/\D/g, '');
    return d.length === 13 ? d.slice(-13) : d.padStart(13, '0').slice(-13);
  }
  const d = digitsOnly(String(raw));
  return d.length === 13 ? d : null;
}

function assertNationalIdMatches(row: Record<string, unknown> | null, nationalIdDigits: string) {
  const fromDb = nationalIdFromLegacyRow(row);
  if (!fromDb || fromDb !== nationalIdDigits) {
    throw unauthorized('เลขบัตรประชาชนไม่ตรงกับข้อมูลลูกค้าสำหรับเบอร์นี้');
  }
}

function randomRef(): string {
  return randomInt(1_000_000, 9_999_999).toString();
}

function otpCode(): string {
  return String(randomInt(0, 9_999)).padStart(4, '0');
}

function pickLegacyCustomerId(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  const explicit = legacyField(row, [
    'legacyCustomerId',
    'legacy_customer_id',
    'cus_code',
    'cusCode',
    'CUS_CODE',
  ]);
  if (explicit !== undefined && explicit !== null) {
    if (typeof explicit === 'bigint') return explicit.toString();
    const s = String(explicit).trim();
    if (s.length > 0) return s;
  }
  const comp = legacyField(row, ['COMPID', 'compid', 'CMPCDE', 'cmpcde']);
  const idno = legacyField(row, ['IDNO', 'idno']);
  if (comp !== undefined && comp !== null && idno !== undefined && idno !== null) {
    return `${String(comp).trim()}:${String(idno).trim()}`;
  }
  if (idno !== undefined && idno !== null) {
    if (typeof idno === 'bigint') return idno.toString();
    const s = String(idno).trim();
    if (s.length > 0) return s;
  }
  return null;
}

/**
 * คีย์ลูกค้า legacy สำหรับดึงสัญญา — ยึดผลจากเบอร์ในโทเคน (เดียวกับ /me/profile) ก่อน แล้วค่อย fallback เป็น sub ใน JWT
 * แก้กรณี JWT `sub` ไม่ตรงกับ CONCAT(COMPID, ':', IDNO) ใน hpcontract (เช่น ลิงก์ LINE เก็บรหัสรูปแบบเก่า)
 */
export async function resolveLegacyCustomerIdForCustomerSession(auth: AuthPrincipal): Promise<string> {
  const phone = auth.customerPhone?.trim();
  if (!phone) return auth.id;
  const row = await findCustomerByPhone(phone);
  const resolved = pickLegacyCustomerId(row);
  return resolved ?? auth.id;
}

export const customerAuthService = {
  async requestOtp(phoneRaw: string, nationalIdDigits?: string) {
    const parsed = parseCustomerThaiMobile(phoneRaw);
    if (!parsed.ok) throw badRequest(parsed.message);
    const { local: phone, msisdn } = parsed;
    if (isBlockedThaiBulkMsisdn(msisdn, blockedThaiBulkMsisdns)) {
      throw badRequest('ไม่อนุญาตให้ส่ง OTP ไปยังเบอร์ทดสอบนี้ — กรุณาใช้เบอร์มือถือจริง');
    }

    const rlKey = `otp:sms:${phone}`;
    const n = await redis.incr(rlKey);
    if (n === 1) await redis.expire(rlKey, env.OTP_RATE_LIMIT_WINDOW_SEC);
    if (n > env.OTP_RATE_LIMIT_MAX) throw tooManyRequests('ขอรหัส OTP บ่อยเกินไป ลองใหม่ภายหลัง');

    const row = await findCustomerByPhone(phone);
    const cusId = pickLegacyCustomerId(row);
    if (!cusId) throw unauthorized('ไม่พบลูกค้าในระบบสำหรับเบอร์นี้');
    if (nationalIdDigits) {
      const nid = digitsOnly(nationalIdDigits);
      if (nid.length !== 13) throw badRequest('เลขบัตรประชาชนไม่ถูกต้อง');
      assertNationalIdMatches(row, nid);
    }

    const expiresAt = dayjs().add(5, 'minute').toDate();

    if (env.THAIBULKSMS_OTP_STRATEGY === 'provider') {
      const { token, refno } = await requestThaiBulkSmsOtp(msisdn);
      const oid = newDbId();
      const createdAt = new Date();
      await prisma.$executeRawUnsafe(
        'INSERT INTO `otp_verifications` (`id`,`phone`,`otp_code`,`ref_code`,`expires_at`,`verified_at`,`created_at`) VALUES (?,?,?,?,?,?,?)',
        oid,
        phone,
        `${THAIBULK_PROVIDER_OTP_PREFIX}${token}`,
        refno,
        expiresAt,
        null,
        createdAt,
      );
      return { sent: true, refCode: refno, expiresAt: expiresAt.toISOString() };
    }

    const code = otpCode();
    const refCode = randomRef();
    const otpHash = await bcrypt.hash(code, env.OTP_BCRYPT_COST);

    const oid = newDbId();
    const createdAt = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `otp_verifications` (`id`,`phone`,`otp_code`,`ref_code`,`expires_at`,`verified_at`,`created_at`) VALUES (?,?,?,?,?,?,?)',
      oid,
      phone,
      otpHash,
      refCode,
      expiresAt,
      null,
      createdAt,
    );

    const msg = `[SKM Easy] รหัส OTP ของคุณคือ ${code} (อ้างอิง ${refCode}) ห้ามแชร์กับผู้อื่น`;
    await sendThaiBulkSms(msisdn, msg);

    return { sent: true, refCode, expiresAt: expiresAt.toISOString() };
  },

  async verifyOtp(input: {
    phone: string;
    refCode: string;
    otpCode: string;
    nationalId: string;
    /** LIFF id_token — บังคับสำหรับผูก LINE */
    idToken: string;
    lineUserName?: string;
    lineUserProfile?: string;
  }) {
    if (!/^\d{4}$/.test(input.otpCode.trim())) {
      throw badRequest('รหัส OTP ต้องเป็นตัวเลข 4 หลัก');
    }
    const parsedPhone = parseCustomerThaiMobile(input.phone);
    if (!parsedPhone.ok) throw badRequest(parsedPhone.message);
    const { local: phone } = parsedPhone;
    const attemptKey = `otp:verify:attempt:${phone}`;

    const bumpFailedVerifyAttempts = async () => {
      const n = await redis.incr(attemptKey);
      if (n === 1) await redis.expire(attemptKey, env.OTP_VERIFY_LOCK_WINDOW_SEC);
      if (n > env.OTP_VERIFY_MAX_ATTEMPTS) {
        throw tooManyRequests('พยายามยืนยัน OTP เกินจำนวนที่อนุญาต ลองใหม่ภายหลัง');
      }
    };

    type OtpVerRow = {
      id: string;
      phone: string;
      otpCode: string;
      refCode: string;
      expiresAt: Date;
      verifiedAt: Date | null;
      createdAt: Date;
    };
    const otpRows = await prisma.$queryRawUnsafe<OtpVerRow[]>(
      'SELECT `id`,`phone`,`otp_code` AS otpCode,`ref_code` AS refCode,`expires_at` AS expiresAt,`verified_at` AS verifiedAt,`created_at` AS createdAt FROM `otp_verifications` WHERE `phone` = ? AND `ref_code` = ? AND `verified_at` IS NULL ORDER BY `created_at` DESC LIMIT 1',
      phone,
      input.refCode,
    );
    const row = otpRows[0];
    if (!row || row.expiresAt < new Date()) {
      await bumpFailedVerifyAttempts();
      throw unauthorized('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    }
    const otpInput = input.otpCode.trim();
    if (row.otpCode.startsWith(THAIBULK_PROVIDER_OTP_PREFIX)) {
      const token = row.otpCode.slice(THAIBULK_PROVIDER_OTP_PREFIX.length);
      if (!token) {
        await bumpFailedVerifyAttempts();
        throw unauthorized('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
      }
      const ok = await verifyThaiBulkSmsOtp({ token, pin: otpInput });
      if (!ok) {
        await bumpFailedVerifyAttempts();
        throw unauthorized('รหัส OTP ไม่ถูกต้อง');
      }
    } else if (row.otpCode.startsWith('$2')) {
      const ok = await bcrypt.compare(otpInput, row.otpCode);
      if (!ok) {
        await bumpFailedVerifyAttempts();
        throw unauthorized('รหัส OTP ไม่ถูกต้อง');
      }
    } else {
      await bumpFailedVerifyAttempts();
      throw unauthorized('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    }

    await redis.del(attemptKey);
    await prisma.$executeRawUnsafe(
      'UPDATE `otp_verifications` SET `verified_at` = ? WHERE `id` = ?',
      new Date(),
      row.id,
    );

    const cusRow = await findCustomerByPhone(phone);
    const legacyCustomerId = pickLegacyCustomerId(cusRow);
    if (!legacyCustomerId) throw unauthorized('ไม่พบรหัสลูกค้าในระบบเก่า');

    const nid = digitsOnly(input.nationalId);
    if (nid.length !== 13) throw badRequest('เลขบัตรประชาชนไม่ถูกต้อง');
    assertNationalIdMatches(cusRow, nid);

    let lineUserId: string;
    let lineUserName = input.lineUserName?.trim();
    let lineUserProfile = input.lineUserProfile?.trim();

    const prof = await verifyLiffIdTokenProfile(input.idToken.trim());
    lineUserId = prof.lineUserId;
    if (!lineUserName && prof.displayName) lineUserName = prof.displayName;
    if (!lineUserProfile && prof.pictureUrl) lineUserProfile = prof.pictureUrl;
    if (lineUserId.length < 4) throw badRequest('LINE user id ไม่ถูกต้อง');

    const linkRows = await prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
      'SELECT `id`, `legacy_customer_id` AS legacyCustomerId, `line_user_id` AS lineUserId, `customer_phone` AS customerPhone, `line_display_name` AS lineDisplayName, `line_picture_url` AS linePictureUrl, `created_at` AS createdAt FROM `customer_liff_links` WHERE `line_user_id` = ? LIMIT 1',
      lineUserId,
    );
    const existing = linkRows[0];
    if (existing) {
      if (existing.legacyCustomerId !== legacyCustomerId) {
        throw badRequest('บัญชี LINE นี้ผูกกับลูกค้าอื่นในระบบแล้ว');
      }
      const linkPatch: { lineDisplayName?: string | null; linePictureUrl?: string | null } = {};
      if (lineUserName) linkPatch.lineDisplayName = lineUserName;
      if (lineUserProfile) linkPatch.linePictureUrl = lineUserProfile;
      if (Object.keys(linkPatch).length > 0) {
        const sets: string[] = [];
        const vals: unknown[] = [];
        if (linkPatch.lineDisplayName !== undefined) {
          sets.push('`line_display_name` = ?');
          vals.push(linkPatch.lineDisplayName);
        }
        if (linkPatch.linePictureUrl !== undefined) {
          sets.push('`line_picture_url` = ?');
          vals.push(linkPatch.linePictureUrl);
        }
        vals.push(lineUserId);
        await prisma.$executeRawUnsafe(
          `UPDATE \`customer_liff_links\` SET ${sets.join(', ')} WHERE \`line_user_id\` = ?`,
          ...vals,
        );
      }
      if (env.LEGACY_LINE_LINK_UPDATE_SQL?.trim() && (lineUserName || lineUserProfile)) {
        try {
          await linkLineProfile({
            lineUserId,
            lineUserName: lineUserName ?? '',
            lineProfile: lineUserProfile ?? '',
            legacyCustomerId,
          });
        } catch {
          /* legacy SQL อาจรองรับแค่ 1 ค่า — ไม่ทำให้ลงทะเบียนล้ม */
        }
      }
      return issueCustomerTokens(legacyCustomerId, phone, lineUserId);
    }

    const linkCount = await countLinksForCustomer(legacyCustomerId);
    if (linkCount >= 2) {
      throw badRequest(
        'ลงทะเบียน LINE ได้สูงสุด 2 บัญชี — กรุณายกเลิกการเชื่อมต่อในตั้งค่าก่อนเพิ่มเครื่องใหม่',
      );
    }

    await createCustomerLiffLink({
      legacyCustomerId,
      lineUserId,
      customerPhone: phone,
      lineDisplayName: lineUserName,
      linePictureUrl: lineUserProfile,
    });

    if (env.LEGACY_LINE_LINK_UPDATE_SQL?.trim()) {
      try {
        await linkLineProfile({
          lineUserId,
          lineUserName: lineUserName ?? '',
          lineProfile: lineUserProfile ?? '',
          legacyCustomerId,
        });
      } catch {
        /* legacy SQL อาจรองรับแค่ 1 ค่า — ไม่ทำให้ลงทะเบียนล้ม */
      }
    }

    return issueCustomerTokens(legacyCustomerId, phone, lineUserId);
  },

  async refreshWithCustomerRefreshToken(refreshToken: string) {
    return refreshCustomerSession(refreshToken);
  },
};
