/**
 * Middleware ตรวจ JWT access และโหลดผู้ใช้จาก DB ใส่ context
 */
import type { MiddlewareHandler } from 'hono';
import { verifyAccessToken } from './jwt.js';
import { prisma } from '../db/client.js';
import { unauthorized, forbidden } from '../http/errors.js';
import type { UserRow } from '../../features/auth/auth.repo.js';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('ต้องส่ง Bearer token');
  }
  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('โทเคนไม่ถูกต้องหรือหมดอายุ');
  }
  if (payload.roles?.includes('customer')) {
    c.set('auth', {
      id: payload.sub,
      email: payload.email,
      isActive: true,
      roles: ['customer'],
      permissions: payload.permissions?.length ? payload.permissions : ['customer:self'],
      customerPhone: payload.customerPhone,
    });
    await next();
    return;
  }
  const rows = await prisma.$queryRawUnsafe<UserRow[]>(
    'SELECT * FROM `User` WHERE `id` = ? AND `deletedAt` IS NULL AND `isActive` = true LIMIT 1',
    payload.sub,
  );
  const user = rows[0];
  if (!user) {
    throw unauthorized('บัญชีผู้ใช้ไม่พร้อมใช้งาน');
  }
  c.set('auth', {
    id: user.id,
    email: user.email,
    isActive: user.isActive,
    roles: user.isStaff ? ['staff'] : ['user'],
    permissions: [],
  });
  await next();
};

export const requireCustomer: MiddlewareHandler = async (c, next) => {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  if (!auth.roles.includes('customer')) throw forbidden('ต้องล็อกอินลูกค้าแอป');
  await next();
};
