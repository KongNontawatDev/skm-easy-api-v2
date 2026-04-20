/**
 * บังคับว่าผู้ใช้ต้องเป็นพนักงานระบบ (JWT มี role `staff` จาก isStaff ใน DB)
 */
import type { MiddlewareHandler } from 'hono';
import { forbidden, unauthorized } from '../http/errors.js';

export const requireStaff: MiddlewareHandler = async (c, next) => {
  const auth = c.get('auth');
  if (!auth) throw unauthorized();
  if (!auth.roles.includes('staff')) {
    throw forbidden();
  }
  await next();
};
