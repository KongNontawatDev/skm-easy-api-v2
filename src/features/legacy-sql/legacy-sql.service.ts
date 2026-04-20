/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - ชั้นดึง/อัปเดตข้อมูลจาก MariaDB legacy ด้วย SQL จากไฟล์ใน `config/legacy-sql/` (หรือ `LEGACY_SQL_DIR`)
 *
 * ใช้ในระบบส่วนไหน
 * - ลูกค้าแอป (สัญญา, งวด, ใบเสร็จ, ผูก LINE), แอดมินอนุมัติชำระ (อัปเดตงวด legacy)
 *
 * 🔐 ความปลอดภัย SQL
 * - ค่าจากผู้ใช้ส่งเข้าเสมอผ่านพารามิเตอร์ `?` เท่านั้น — **ห้าม** interpolate string เข้า SQL
 * - ก่อนรันมี `assertSafeLegacySql` กรองคำสั่งอันตราย
 * - ใช้ `$queryRawUnsafe(sql, ...params)` ผ่าน mysql2 (prepared / bind พารามิเตอร์)
 *
 * ⚠️ ห้ามแก้ logic bind พารามิเตอร์โดยไม่ทบทวน — เกี่ยวกับ SQL injection
 */
import { prisma } from '../../core/db/client.js';
import { env } from '../../core/env/config.js';
import { serviceUnavailable } from '../../core/http/errors.js';
import { getLegacySqlTexts } from './legacy-sql-files.js';

export type LegacyRow = Record<string, unknown>;

/** กรอง statement — ลดความเสี่ยงเมื่อไฟล์ SQL ถูกแก้ผิดพลาด */
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
    throw serviceUnavailable(
      `ยังไม่ตั้งค่า ${name} — สร้างไฟล์ใน ${env.LEGACY_SQL_DIR} ตามชื่อใน legacy-sql-files.ts`,
    );
  }
  assertSafeLegacySql(sql, name);
  return prisma.$queryRawUnsafe<LegacyRow[]>(sql, ...params);
}

const q = getLegacySqlTexts;

export async function findCustomerByPhone(phone: string): Promise<LegacyRow | null> {
  const rows = await legacyQuery(q().accCusByPhone, [phone], 'acc-cus-by-phone.sql');
  return rows[0] ?? null;
}

export async function listContractsForCustomer(cusId: string): Promise<LegacyRow[]> {
  return legacyQuery(q().contractsByCustomer, [cusId], 'contracts-by-customer.sql');
}

export async function getContractDetail(contractRef: string): Promise<LegacyRow | null> {
  const rows = await legacyQuery(q().contractDetail, [contractRef], 'contract-detail.sql');
  return rows[0] ?? null;
}

export async function listInstallmentsByContract(contractRef: string): Promise<LegacyRow[]> {
  return legacyQuery(q().installmentsByContract, [contractRef], 'installments-by-contract.sql');
}

export async function listReceiptsForCustomer(cusId: string): Promise<LegacyRow[]> {
  return legacyQuery(q().receiptsByCustomer, [cusId], 'receipts-by-customer.sql');
}

export async function linkLineProfile(params: {
  lineUserId: string;
  lineUserName: string;
  lineProfile: string;
  legacyCustomerId: string;
}): Promise<void> {
  const sql = q().lineLinkUpdate?.trim();
  if (!sql) return;
  await legacyQuery(sql, [params.lineUserId, params.lineUserName, params.lineProfile, params.legacyCustomerId], 'line-link-update.sql');
}

export async function getLineUserIdForCustomer(legacyCustomerId: string): Promise<string | null> {
  const rows = await legacyQuery(q().lineUserByCustomer, [legacyCustomerId], 'line-user-by-customer.sql');
  const v = rows[0]?.line_user_id ?? rows[0]?.lineUserId;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function markLegacyInstallmentPaid(args: unknown[]): Promise<void> {
  const sql = q().markInstallmentPaid?.trim();
  if (!sql) return;
  await legacyQuery(sql, args, 'mark-installment-paid.sql');
}

/** มี SQL อัปเดต legacy ตอนผูก LINE หรือไม่ */
export function hasLegacyLineLinkUpdateSql(): boolean {
  return Boolean(q().lineLinkUpdate?.trim());
}
