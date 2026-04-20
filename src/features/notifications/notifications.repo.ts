/**
 * แจ้งเตือนในแอปลูกค้า — ตาราง `notifications` (Prisma: CustomerAppNotification)
 * คอลัมน์ `idno` = รหัสลูกค้า legacy จาก `acct_cust` (ตรงกับ JWT ลูกค้า)
 */
import { prisma } from '../../core/db/client.js';

export type NotificationRow = {
  id: string;
  idno: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
};

export const notificationsRepo = {
  async listForCustomer(idno: string, params: { page: number; limit: number }): Promise<NotificationRow[]> {
    const skip = (params.page - 1) * params.limit;
    const take = params.limit + 1;
    return prisma.$queryRawUnsafe<NotificationRow[]>(
      'SELECT `id`,`idno`,`title`,`message`,`type`,`is_read` AS isRead,`created_at` AS createdAt FROM `notifications` WHERE `idno` = ? ORDER BY `created_at` DESC LIMIT ? OFFSET ?',
      idno,
      take,
      skip,
    );
  },

  async countForCustomer(idno: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(
      'SELECT COUNT(*) AS c FROM `notifications` WHERE `idno` = ?',
      idno,
    );
    const v = rows[0]?.c ?? 0;
    return typeof v === 'bigint' ? Number(v) : Number(v);
  },

  async markRead(idno: string, id: string): Promise<number> {
    const n = await prisma.$executeRawUnsafe(
      'UPDATE `notifications` SET `is_read` = true WHERE `id` = ? AND `idno` = ?',
      id,
      idno,
    );
    return typeof n === 'number' ? n : Number(n);
  },
};
