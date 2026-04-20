/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: บันทึก audit trail ลง DB + ไฟล์ `audit` channel ของ Winston
 * - ใช้ในส่วนไหนของระบบ: admin routes หลังการกระทำสำคัญ (เช่น refund/ship)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: Prisma `$executeRaw` (`AuditLog`), `auditLogger`, `env.AUDIT_LOG_ENABLED`
 *
 * 🛡 เหตุผล: การเปลี่ยนแปลงเงิน/สิทธิ์ควรสืบย้อนกลับได้ — audit log ช่วย compliance
 */
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { AUDIT_LOG_ENABLED } from '../../core/constants.js';
import { auditLogger, logger } from '../../core/logger/logger.js';

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: ข้อมูลเหตุการณ์ (user, action, resource, ip, meta ฯลฯ)
 * - ทำงานยังไง: ถ้า `AUDIT_LOG_ENABLED` ปิดจะไม่เขียน DB; ถ้าเปิดจะ insert `AuditLog` และ log สองช่องทาง
 * - return อะไร: Promise<void>
 */
export async function recordAudit(input: {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: unknown;
}) {
  if (!AUDIT_LOG_ENABLED) return;
  const id = newDbId();
  const createdAt = new Date();
  const metaJson = input.meta === undefined ? null : JSON.stringify(input.meta);
  if (metaJson === null) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO `AuditLog` (`id`,`userId`,`action`,`resource`,`resourceId`,`ip`,`userAgent`,`meta`,`createdAt`) VALUES (?,?,?,?,?,?,?,NULL,?)',
      id,
      input.userId ?? null,
      input.action,
      input.resource,
      input.resourceId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      createdAt,
    );
  } else {
    await prisma.$executeRawUnsafe(
      'INSERT INTO `AuditLog` (`id`,`userId`,`action`,`resource`,`resourceId`,`ip`,`userAgent`,`meta`,`createdAt`) VALUES (?,?,?,?,?,?,?,CAST(? AS JSON),?)',
      id,
      input.userId ?? null,
      input.action,
      input.resource,
      input.resourceId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      metaJson,
      createdAt,
    );
  }
  auditLogger.info('audit', {
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    userId: input.userId,
    meta: input.meta,
  });
  logger.debug('บันทึก audit', { action: input.action });
}
