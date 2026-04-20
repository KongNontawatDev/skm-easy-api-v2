import { prisma } from '../../core/db/client.js';
import type { UserRow } from '../auth/auth.repo.js';

export const usersRepo = {
  async findProfile(userId: string): Promise<UserRow | null> {
    const rows = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT * FROM `User` WHERE `id` = ? AND `deletedAt` IS NULL LIMIT 1',
      userId,
    );
    return rows[0] ?? null;
  },
};
