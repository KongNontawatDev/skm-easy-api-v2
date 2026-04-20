/**
 * Better Auth — แอดมิน back-office (แยกจากตาราง `User` / JWT เดิม)
 *
 * เอกสารอ้างอิง:
 * - [Basic usage](https://www.better-auth.com/docs/basic-usage)
 * - [Email & password](https://better-auth.com/docs/authentication/email-password)
 * - Adapter ฐานข้อมูลแบบ raw SQL (`adminMysqlRawAdapter`) แทน `better-auth/adapters/prisma`
 * - [Hono](https://www.better-auth.com/docs/integrations/hono) — mount handler + CORS + `credentials`
 */
import { betterAuth } from 'better-auth';
import { env } from '../../core/env/config.js';
import { prisma } from '../../core/db/client.js';
import { adminMysqlRawAdapter } from './admin-mysql-raw.adapter.js';
import { sendMailNow } from '../../integrations/email/mailer.js';
import { renderEmailTemplate } from '../../integrations/email/template.engine.js';
import { logger } from '../../core/logger/logger.js';

const corsList = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
const extraOrigins = env.ADMIN_APP_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const trustedOrigins = [
  ...(corsList.includes('*')
    ? [
        env.BETTER_AUTH_URL.replace(/\/$/, ''),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ]
    : corsList),
  ...extraOrigins,
];

export const adminAuth = betterAuth({
  appName: 'SKM Easy Admin',
  baseURL: env.BETTER_AUTH_URL.replace(/\/$/, ''),
  basePath: '/api/v1/admin-auth',
  secret: env.BETTER_AUTH_SECRET,
  database: adminMysqlRawAdapter(prisma),
  emailAndPassword: {
    enabled: true,
    /** สร้างแอดมินผ่าน `prisma db seed` / DBA — ไม่เปิด public sign-up */
    disableSignUp: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        const html = await renderEmailTemplate('admin-password-reset', {
          name: user.name,
          resetUrl: url,
        });
        await sendMailNow({
          to: user.email,
          subject: 'รีเซ็ตรหัสผ่านแอดมิน SKM Easy',
          html,
        });
      } catch (e) {
        logger.error('ส่งอีเมลรีเซ็ตรหัสผ่านแอดมินล้มเหลว', { error: (e as Error).message });
        throw e;
      }
    },
  },
  trustedOrigins,
  user: { modelName: 'adminAuthUser' },
  session: { modelName: 'adminAuthSession' },
  account: { modelName: 'adminAuthAccount' },
  verification: { modelName: 'adminAuthVerification' },
});
