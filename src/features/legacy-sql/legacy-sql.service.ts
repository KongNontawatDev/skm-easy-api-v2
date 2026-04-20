/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - ชั้นดึง/อัปเดตข้อมูลจาก MariaDB legacy (หลายร้อยตาราง) ด้วย SQL ที่กำหนดใน environment
 *
 * ใช้ในระบบส่วนไหน
 * - ลูกค้าแอป (สัญญา, งวด, ใบเสร็จ, ผูก LINE), แอดมินอนุมัติชำระ (อัปเดตงวด legacy)
 *
 * 🔐 ความปลอดภัย SQL
 * - ค่าจากผู้ใช้ส่งเข้าเสมอผ่านพารามิเตอร์ `?` เท่านั้น — **ห้าม** interpolate string เข้า SQL
 * - ตัว statement มาจาก env (ผู้ deploy เป็นคนกำหนด) — ก่อนรันมี `assertSafeLegacySql` กรองคำสั่งอันตราย
 * - Prisma ใช้ `$queryRawUnsafe(sql, ...params)` เพราะ statement ไม่ทราบตายตัวตอน compile — พารามิเตอร์ยังถูก bind แบบ prepared
 *
 * ⚠️ ห้ามแก้ logic bind พารามิเตอร์โดยไม่ทบทวน — เกี่ยวกับ SQL injection
 */
import { prisma } from '../../core/db/client.js';
import { env } from '../../core/env/config.js';
import { serviceUnavailable } from '../../core/http/errors.js';

export type LegacyRow = Record<string, unknown>;

/** กรอง statement จาก env — ลดความเสี่ยงเมื่อค่า env ถูกแก้ผิดพลาดหรือถูก supply-chain */
function assertSafeLegacySql(sql: string, name: string): void {
  const s = sql.trim();
  if (!s) return;
  const blocked = /\b(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|EXEC|EXECUTE)\b/i;
  if (blocked.test(s)) {
    throw serviceUnavailable(`${name}: SQL มีคำสั่งที่ไม่อนุญาต (DDL/EXEC)`);
  }
  if (!/^\s*(SELECT|WITH|UPDATE)\b/is.test(s)) {
    throw serviceUnavailable(`${name}: อนุญาตเฉพาะ SELECT / WITH / UPDATE`);
  }
  const semi = s.indexOf(';');
  if (semi !== -1 && s.slice(semi + 1).trim().length > 0) {
    throw serviceUnavailable(`${name}: ห้ามหลาย statement ในคำสั่งเดียว`);
  }
}

/** รัน raw SQL พร้อมพารามิเตอร์แบบ positional (ใช้ ? ใน statement) */
export async function legacyQuery(sql: string | undefined, params: unknown[], name: string): Promise<LegacyRow[]> {
  if (!sql?.trim()) {
    throw serviceUnavailable(`ยังไม่ตั้งค่า ${name} — ใส่ SQL ใน environment ตาม DEVELOPMENT_RULES.md`);
  }
  assertSafeLegacySql(sql, name);
  return prisma.$queryRawUnsafe<LegacyRow[]>(sql, ...params);
}

export async function findCustomerByPhone(phone: string): Promise<LegacyRow | null> {
  const rows = await legacyQuery(env.LEGACY_ACC_CUS_BY_PHONE_SQL, [phone], 'LEGACY_ACC_CUS_BY_PHONE_SQL');
  return rows[0] ?? null;
}

export async function listContractsForCustomer(cusId: string): Promise<LegacyRow[]> {
  return legacyQuery(env.LEGACY_CONTRACTS_BY_CUSTOMER_SQL, [cusId], 'LEGACY_CONTRACTS_BY_CUSTOMER_SQL');
}

export async function getContractDetail(contractRef: string): Promise<LegacyRow | null> {
  const rows = await legacyQuery(env.LEGACY_CONTRACT_DETAIL_SQL, [contractRef], 'LEGACY_CONTRACT_DETAIL_SQL');
  return rows[0] ?? null;
}

export async function listInstallmentsByContract(contractRef: string): Promise<LegacyRow[]> {
  return legacyQuery(
    env.LEGACY_INSTALLMENTS_BY_CONTRACT_SQL,
    [contractRef],
    'LEGACY_INSTALLMENTS_BY_CONTRACT_SQL',
  );
}

export async function listReceiptsForCustomer(cusId: string): Promise<LegacyRow[]> {
  return legacyQuery(env.LEGACY_RECEIPTS_BY_CUSTOMER_SQL, [cusId], 'LEGACY_RECEIPTS_BY_CUSTOMER_SQL');
}

export async function linkLineProfile(params: {
  lineUserId: string;
  lineUserName: string;
  lineProfile: string;
  legacyCustomerId: string;
}): Promise<void> {
  const sql = env.LEGACY_LINE_LINK_UPDATE_SQL?.trim();
  if (!sql) return;
  await legacyQuery(sql, [params.lineUserId, params.lineUserName, params.lineProfile, params.legacyCustomerId], 'LEGACY_LINE_LINK_UPDATE_SQL');
}

export async function getLineUserIdForCustomer(legacyCustomerId: string): Promise<string | null> {
  const rows = await legacyQuery(
    env.LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL,
    [legacyCustomerId],
    'LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL',
  );
  const v = rows[0]?.line_user_id ?? rows[0]?.lineUserId;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function markLegacyInstallmentPaid(args: unknown[]): Promise<void> {
  if (!env.LEGACY_MARK_INSTALLMENT_PAID_SQL?.trim()) return;
  await legacyQuery(env.LEGACY_MARK_INSTALLMENT_PAID_SQL, args, 'LEGACY_MARK_INSTALLMENT_PAID_SQL');
}
