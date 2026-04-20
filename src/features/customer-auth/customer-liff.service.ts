/**
 * ผูก/ค้นหา LINE LIFF กับลูกค้า legacy (ตาราง customer_liff_links)
 */
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { badRequest, forbidden, serviceUnavailable, unauthorized } from '../../core/http/errors.js';
import {
  signAccessToken,
  signCustomerRefreshToken,
  verifyRefreshToken,
} from '../../core/security/jwt.js';
import type { AuthPrincipal } from '../../core/http/request-context.js';
import { verifyLiffIdToken } from '../../integrations/line/liff-id-token.verify.js';
import { MYSQL_ERR_NO_SUCH_TABLE, MYSQL_ERR_DUPLICATE, mysqlErrno } from '../../core/db/mysql-errors.js';

/** access 2 วัน — ลูกค้าไม่ถนัดล็อกอินบ่อย */
export const CUSTOMER_ACCESS_TTL_SEC = 60 * 60 * 24 * 2;
/** refresh 60 วัน */
export const CUSTOMER_REFRESH_TTL_SEC = 60 * 60 * 24 * 60;

export const MAX_LIFF_LINKS_PER_CUSTOMER = 2;

const liffSelect = `SELECT \`id\`, \`legacy_customer_id\` AS legacyCustomerId, \`line_user_id\` AS lineUserId,
  \`customer_phone\` AS customerPhone, \`line_display_name\` AS lineDisplayName,
  \`line_picture_url\` AS linePictureUrl, \`created_at\` AS createdAt FROM \`customer_liff_links\``;

export type CustomerLiffLinkRow = {
  id: string;
  legacyCustomerId: string;
  lineUserId: string;
  customerPhone: string;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  createdAt: Date;
};

export function principalForCustomer(legacyCustomerId: string, phone: string): AuthPrincipal {
  return {
    id: legacyCustomerId,
    email: `${phone.replace(/\D/g, '')}@customer.skm.internal`,
    isActive: true,
    roles: ['customer'],
    permissions: ['customer:self'],
    customerPhone: phone,
  };
}

export function issueCustomerTokens(legacyCustomerId: string, phone: string, lineUserId: string) {
  const p = principalForCustomer(legacyCustomerId, phone);
  return {
    accessToken: signAccessToken(p, CUSTOMER_ACCESS_TTL_SEC),
    refreshToken: signCustomerRefreshToken(legacyCustomerId, lineUserId, CUSTOMER_REFRESH_TTL_SEC),
    customer: { legacyCustomerId, phone },
  };
}

export async function resolveLineUserIdFromBootstrapBody(input: { idToken?: string }): Promise<string> {
  const t = input.idToken?.trim();
  if (!t) {
    throw badRequest('ต้องส่ง id_token จาก LIFF');
  }
  return verifyLiffIdToken(t);
}

export async function bootstrapByLineUserId(lineUserId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
      `${liffSelect} WHERE \`line_user_id\` = ? LIMIT 1`,
      lineUserId,
    );
    const link = rows[0];
    if (!link) {
      return { status: 'needs_registration' as const, lineUserId };
    }
    const tokens = issueCustomerTokens(link.legacyCustomerId, link.customerPhone, link.lineUserId);
    return { status: 'session' as const, ...tokens };
  } catch (e: unknown) {
    if (mysqlErrno(e) === MYSQL_ERR_NO_SUCH_TABLE) {
      throw serviceUnavailable(
        'ฐานข้อมูลยังไม่มีตารางผูก LINE — ตรวจสอบว่าได้รัน migration SQL บนฐานที่ API ใช้อยู่',
      );
    }
    throw e;
  }
}

export async function countLinksForCustomer(legacyCustomerId: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(
    'SELECT COUNT(*) AS c FROM `customer_liff_links` WHERE `legacy_customer_id` = ?',
    legacyCustomerId,
  );
  const v = rows[0]?.c ?? 0;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

export async function createCustomerLiffLink(input: {
  legacyCustomerId: string;
  lineUserId: string;
  customerPhone: string;
  lineDisplayName?: string;
  linePictureUrl?: string;
}): Promise<void> {
  const n = await countLinksForCustomer(input.legacyCustomerId);
  if (n >= MAX_LIFF_LINKS_PER_CUSTOMER) {
    throw badRequest(
      `ลงทะเบียน LINE ได้สูงสุด ${MAX_LIFF_LINKS_PER_CUSTOMER} บัญชี — กรุณายกเลิกการเชื่อมต่อในตั้งค่าก่อน`,
    );
  }
  try {
    const id = newDbId();
    const t = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `customer_liff_links` (`id`,`legacy_customer_id`,`line_user_id`,`customer_phone`,`line_display_name`,`line_picture_url`,`created_at`) VALUES (?,?,?,?,?,?,?)',
      id,
      input.legacyCustomerId,
      input.lineUserId,
      input.customerPhone,
      input.lineDisplayName ?? null,
      input.linePictureUrl ?? null,
      t,
    );
  } catch (e: unknown) {
    if (mysqlErrno(e) === MYSQL_ERR_DUPLICATE) throw badRequest('บัญชี LINE นี้ถูกใช้แล้ว');
    throw e;
  }
}

export async function unlinkLineForCustomer(legacyCustomerId: string, lineUserId: string): Promise<void> {
  const n = await prisma.$executeRawUnsafe(
    'DELETE FROM `customer_liff_links` WHERE `legacy_customer_id` = ? AND `line_user_id` = ?',
    legacyCustomerId,
    lineUserId,
  );
  const cnt = typeof n === 'number' ? n : Number(n);
  if (cnt === 0) throw forbidden('ไม่พบการเชื่อมต่อ LINE นี้');
}

export async function findLatestCustomerLiffLink(legacyCustomerId: string): Promise<CustomerLiffLinkRow | null> {
  const rows = await prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
    `${liffSelect} WHERE \`legacy_customer_id\` = ? ORDER BY \`created_at\` DESC LIMIT 1`,
    legacyCustomerId,
  );
  return rows[0] ?? null;
}

export async function patchCustomerLiffLinkProfile(
  legacyCustomerId: string,
  lineUserId: string,
  patch: { lineDisplayName?: string | null; linePictureUrl?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.lineDisplayName !== undefined) {
    sets.push('`line_display_name` = ?');
    vals.push(patch.lineDisplayName);
  }
  if (patch.linePictureUrl !== undefined) {
    sets.push('`line_picture_url` = ?');
    vals.push(patch.linePictureUrl);
  }
  if (!sets.length) return;
  vals.push(legacyCustomerId, lineUserId);
  await prisma.$executeRawUnsafe(
    `UPDATE \`customer_liff_links\` SET ${sets.join(', ')} WHERE \`legacy_customer_id\` = ? AND \`line_user_id\` = ?`,
    ...vals,
  );
}

export async function refreshCustomerSession(refreshToken: string) {
  const { sub, lid } = verifyRefreshToken(refreshToken);
  let rows: CustomerLiffLinkRow[];
  if (lid) {
    rows = await prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
      `${liffSelect} WHERE \`line_user_id\` = ? LIMIT 1`,
      lid,
    );
  } else {
    rows = await prisma.$queryRawUnsafe<CustomerLiffLinkRow[]>(
      `${liffSelect} WHERE \`legacy_customer_id\` = ? ORDER BY \`created_at\` DESC LIMIT 1`,
      sub,
    );
  }
  const link = rows[0];
  if (!link || link.legacyCustomerId !== sub) {
    throw unauthorized('ไม่พบการเชื่อมต่อ LINE — กรุณาลงทะเบียนใหม่');
  }
  const p = principalForCustomer(link.legacyCustomerId, link.customerPhone);
  return { accessToken: signAccessToken(p, CUSTOMER_ACCESS_TTL_SEC) };
}
