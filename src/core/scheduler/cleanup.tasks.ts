/**
 * ลบ OTP หมดอายุ / soft-delete เก่า
 * — ถ้า DB ยังไม่มีตาราง (เช่น migrate ไม่ครบ) จะข้ามและ log เตือน ไม่ให้งาน scheduler ล้มทุกชั่วโมง
 */
import dayjs from 'dayjs';
import { prisma } from '../db/client.js';
import { logger } from '../logger/logger.js';
import { MYSQL_ERR_NO_SUCH_TABLE, mysqlErrno } from '../db/mysql-errors.js';

function isMissingTableError(e: unknown): boolean {
  if (mysqlErrno(e) === MYSQL_ERR_NO_SUCH_TABLE) return true;
  const msg = e instanceof Error ? e.message : '';
  return msg.includes('does not exist in the current database');
}

export async function runScheduledCleanup(): Promise<void> {
  const now = new Date();
  let otpCount = 0;
  try {
    const r = await prisma.$executeRawUnsafe(
      'DELETE FROM `Otp` WHERE `expiresAt` < ? OR `consumedAt` IS NOT NULL',
      now,
    );
    otpCount = typeof r === 'number' ? r : Number(r);
  } catch (e) {
    if (isMissingTableError(e)) {
      logger.warn('ข้ามลบ Otp — ไม่มีตารางใน DB (ตรวจสอบ schema / migration SQL)');
    } else {
      throw e;
    }
  }

  try {
    const old = dayjs().subtract(90, 'day').toDate();
    await prisma.$executeRawUnsafe('DELETE FROM `User` WHERE `deletedAt` < ?', old);
  } catch (e) {
    if (isMissingTableError(e)) {
      logger.warn('ข้ามลบ User ที่ลบนานแล้ว — ไม่มีตารางใน DB (ตรวจสอบ schema / migration SQL)');
    } else {
      throw e;
    }
  }

  logger.info('ทำความสะอาดระบบ', { otp: otpCount });
}
