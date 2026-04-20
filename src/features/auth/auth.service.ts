/**
 * Business logic การยืนยันตัวตน — สมัคร, ล็อกอิน, refresh, OTP อีเมล, LINE OAuth
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import dayjs from 'dayjs';
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/security/jwt.js';
import { badRequest, tooManyRequests, unauthorized } from '../../core/http/errors.js';
import type { AuthPrincipal } from '../../core/http/request-context.js';
import { authRepo, type UserRow } from './auth.repo.js';
import { renderEmailTemplate } from '../../integrations/email/template.engine.js';
import { sendMailNow } from '../../integrations/email/mailer.js';
import { exchangeLineAuthorizationCode, fetchLineProfile } from '../../integrations/line/line.login.js';
import { redis } from '../../core/security/redis.client.js';
import { env } from '../../core/env/config.js';
import { usersService } from '../users/users.service.js';

function toPrincipal(user: { id: string; email: string; isActive: boolean; isStaff: boolean }): AuthPrincipal {
  return {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    roles: user.isStaff ? ['staff'] : ['user'],
    permissions: [],
  };
}

export const authService = {
  async register(input: { email: string; password: string; name?: string }) {
    const exists = await authRepo.findUserByEmail(input.email);
    if (exists) {
      throw badRequest('อีเมลนี้ถูกใช้แล้ว');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await authRepo.createUser({
      email: input.email,
      passwordHash,
      name: input.name,
      isStaff: false,
    });
    const principal = toPrincipal(user);
    return {
      accessToken: signAccessToken(principal),
      refreshToken: signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    };
  },

  async login(input: { email: string; password: string }) {
    const user = await authRepo.findUserByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    if (user.isStaff) {
      throw unauthorized('บัญชีพนักงานใช้ล็อกอินแอดมิน (Better Auth) ที่เส้นทาง /api/v1/admin-auth');
    }
    const principal = toPrincipal(user);
    return {
      accessToken: signAccessToken(principal),
      refreshToken: signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    };
  },

  async refresh(refreshToken: string) {
    const { sub } = verifyRefreshToken(refreshToken);
    const rows = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT * FROM `User` WHERE `id` = ? AND `deletedAt` IS NULL AND `isActive` = true LIMIT 1',
      sub,
    );
    const user = rows[0];
    if (!user) throw unauthorized();
    const principal = toPrincipal(user);
    return { accessToken: signAccessToken(principal) };
  },

  async requestOtp(input: { email: string; purpose: 'login' | 'verify_email' }) {
    const rlKey = `otp:rate:${input.email.toLowerCase()}`;
    const n = await redis.incr(rlKey);
    if (n === 1) {
      await redis.expire(rlKey, env.OTP_RATE_LIMIT_WINDOW_SEC);
    }
    if (n > env.OTP_RATE_LIMIT_MAX) {
      throw tooManyRequests('ขอรหัส OTP บ่อยเกินไป โปรดลองใหม่ภายหลัง');
    }
    const code = String(randomInt(0, 9_999)).padStart(4, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const user = await authRepo.findUserByEmail(input.email);
    const id = newDbId();
    const expiresAt = dayjs().add(10, 'minute').toDate();
    const createdAt = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `Otp` (`id`,`userId`,`email`,`codeHash`,`purpose`,`expiresAt`,`consumedAt`,`createdAt`) VALUES (?,?,?,?,?,?,?,?)',
      id,
      user?.id ?? null,
      input.email,
      codeHash,
      input.purpose,
      expiresAt,
      null,
      createdAt,
    );
    const html = await renderEmailTemplate('otp', { code, minutes: 10 });
    await sendMailNow({
      to: input.email,
      subject: 'รหัส OTP ของคุณ',
      html,
    });
    return { sent: true };
  },

  async verifyOtp(input: { email: string; code: string; purpose: 'login' | 'verify_email' }) {
    if (!/^\d{4}$/.test(input.code.trim())) {
      throw badRequest('รหัส OTP ต้องเป็นตัวเลข 4 หลัก');
    }
    type OtpRow = {
      id: string;
      userId: string | null;
      email: string;
      codeHash: string;
      purpose: string;
      expiresAt: Date;
      consumedAt: Date | null;
      createdAt: Date;
    };
    const otpRows = await prisma.$queryRawUnsafe<OtpRow[]>(
      'SELECT * FROM `Otp` WHERE `email` = ? AND `purpose` = ? AND `consumedAt` IS NULL ORDER BY `createdAt` DESC LIMIT 1',
      input.email,
      input.purpose,
    );
    const otp = otpRows[0];
    if (!otp || dayjs(otp.expiresAt).isBefore(dayjs())) {
      throw badRequest('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    }
    const ok = await bcrypt.compare(input.code.trim(), otp.codeHash);
    if (!ok) throw badRequest('รหัส OTP ไม่ถูกต้อง');
    const now = new Date();
    await prisma.$executeRawUnsafe('UPDATE `Otp` SET `consumedAt` = ? WHERE `id` = ?', now, otp.id);
    let user: UserRow | null = null;
    if (otp.userId) {
      const u = await prisma.$queryRawUnsafe<UserRow[]>(
        'SELECT * FROM `User` WHERE `id` = ? LIMIT 1',
        otp.userId,
      );
      user = u[0] ?? null;
    }
    if (!user) {
      const u2 = await prisma.$queryRawUnsafe<UserRow[]>(
        'SELECT * FROM `User` WHERE `email` = ? AND `deletedAt` IS NULL LIMIT 1',
        input.email,
      );
      user = u2[0] ?? null;
    }
    if (!user) {
      const id = newDbId();
      const t = new Date();
      await prisma.$executeRawUnsafe(
        'INSERT INTO `User` (`id`,`email`,`passwordHash`,`isStaff`,`isActive`,`deletedAt`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?)',
        id,
        input.email,
        null,
        false,
        true,
        null,
        t,
        t,
      );
      const created = await prisma.$queryRawUnsafe<UserRow[]>('SELECT * FROM `User` WHERE `id` = ? LIMIT 1', id);
      user = created[0]!;
    }
    const principal = toPrincipal(user);
    await usersService.invalidateProfileCache(user.id);
    return {
      accessToken: signAccessToken(principal),
      refreshToken: signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    };
  },

  async lineOAuthCallback(code: string) {
    const tokens = await exchangeLineAuthorizationCode(code);
    const profile = await fetchLineProfile(tokens.access_token);
    let user = await authRepo.findUserByLineId(profile.userId);
    if (!user) {
      const email = `${profile.userId}@line.local`;
      const id = newDbId();
      const t = new Date();
      await prisma.$executeRawUnsafe(
        'INSERT INTO `User` (`id`,`email`,`passwordHash`,`name`,`lineUserId`,`isStaff`,`isActive`,`deletedAt`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id,
        email,
        null,
        profile.displayName,
        profile.userId,
        false,
        true,
        null,
        t,
        t,
      );
      const rows = await prisma.$queryRawUnsafe<UserRow[]>('SELECT * FROM `User` WHERE `id` = ? LIMIT 1', id);
      user = rows[0]!;
    } else {
      const id = user.id;
      await authRepo.updateLineProfile(id, {
        lineUserId: profile.userId,
        name: profile.displayName,
      });
      const rows = await prisma.$queryRawUnsafe<UserRow[]>('SELECT * FROM `User` WHERE `id` = ? LIMIT 1', id);
      user = rows[0]!;
    }
    const principal = toPrincipal(user);
    await usersService.invalidateProfileCache(user.id);
    return {
      accessToken: signAccessToken(principal),
      refreshToken: signRefreshToken(user.id),
      user: { id: user.id, email: user.email },
    };
  },
};
