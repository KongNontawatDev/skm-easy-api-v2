/**
 * โปรไฟล์ผู้ใช้ระบบภายใน (Prisma User)
 */
import { usersRepo } from './users.repo.js';

export const usersService = {
  async getMe(userId: string) {
    const user = await usersRepo.findProfile(userId);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isStaff: user.isStaff,
      roles: user.isStaff ? ['staff'] : ['user'],
    };
  },

  async invalidateProfileCache(_userId: string): Promise<void> {
    /* no cache layer */
  },
};
