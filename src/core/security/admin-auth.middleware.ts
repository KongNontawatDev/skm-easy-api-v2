/**
 * ตรวจ session ของ Better Auth (แอดมิน) แล้วใส่ `auth` ใน context เป็น role staff
 */
import type { MiddlewareHandler } from 'hono';
import { adminAuth } from '../../features/admin-auth/better-auth.js';
import { unauthorized } from '../http/errors.js';

export const adminBetterAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const session = await adminAuth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw unauthorized('ต้องล็อกอินแอดมิน');
  }
  c.set('auth', {
    id: session.user.id,
    email: session.user.email,
    isActive: true,
    roles: ['staff'],
    permissions: [],
  });
  await next();
};
