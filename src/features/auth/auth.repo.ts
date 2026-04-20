/**
 * Repository สำหรับ auth — query ผู้ใช้ผ่าน raw SQL (mysql2)
 */
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';

export type UserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  phone: string | null;
  lineUserId: string | null;
  isStaff: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const authRepo = {
  async findUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT * FROM `User` WHERE `email` = ? AND `deletedAt` IS NULL LIMIT 1',
      email,
    );
    return rows[0] ?? null;
  },
  async findUserByLineId(lineUserId: string): Promise<UserRow | null> {
    const rows = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT * FROM `User` WHERE `lineUserId` = ? AND `deletedAt` IS NULL LIMIT 1',
      lineUserId,
    );
    return rows[0] ?? null;
  },
  async createUser(data: { email: string; passwordHash: string; name?: string | null; isStaff?: boolean }) {
    const id = newDbId();
    const now = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `User` (`id`,`email`,`passwordHash`,`name`,`isStaff`,`isActive`,`deletedAt`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?)',
      id,
      data.email,
      data.passwordHash,
      data.name ?? null,
      data.isStaff ?? false,
      true,
      null,
      now,
      now,
    );
    const rows = await prisma.$queryRawUnsafe<UserRow[]>('SELECT * FROM `User` WHERE `id` = ? LIMIT 1', id);
    return rows[0]!;
  },
  async updateLineProfile(userId: string, profile: { lineUserId: string; name?: string | null }) {
    const now = new Date();
    if (profile.name !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE `User` SET `lineUserId` = ?, `name` = ?, `updatedAt` = ? WHERE `id` = ?',
        profile.lineUserId,
        profile.name,
        now,
        userId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        'UPDATE `User` SET `lineUserId` = ?, `updatedAt` = ? WHERE `id` = ?',
        profile.lineUserId,
        now,
        userId,
      );
    }
    const rows = await prisma.$queryRawUnsafe<UserRow[]>('SELECT * FROM `User` WHERE `id` = ? LIMIT 1', userId);
    return rows[0]!;
  },
};
