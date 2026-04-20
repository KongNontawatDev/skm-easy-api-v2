/**
 * ทดสอบ Better Auth แอดมินแบบไม่ต้องเปิด HTTP server — เรียก `adminAuth.handler` โดยตรง
 *
 * รัน: npx tsx scripts/test-admin-better-auth.ts
 * ต้องมี DB + migration ตาราง admin_auth_* และ seed แอดมิน (admin@example.com / Admin1234!)
 */
import { adminAuth } from '../src/features/admin-auth/better-auth.js';
import { prisma } from '../src/core/db/client.js';
import { env } from '../src/core/env/config.js';

const EMAIL = process.env.ADMIN_TEST_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? 'Admin1234!';

function joinCookieHeader(setCookie: string[]): string {
  return setCookie
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function main() {
  const urows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    'SELECT `id` FROM `admin_auth_user` WHERE `email` = ? LIMIT 1',
    EMAIL,
  );
  if (!urows.length) {
    // eslint-disable-next-line no-console
    console.error(`ไม่พบแอดมิน ${EMAIL} — รัน npm run seed:admin ก่อน`);
    process.exit(1);
  }

  const base = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/v1/admin-auth`;
  const devOrigin = 'http://localhost:5173';

  const signInRes = await adminAuth.handler(
    new Request(`${base}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: devOrigin,
      },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        rememberMe: true,
      }),
    }),
  );

  if (!signInRes.ok) {
    // eslint-disable-next-line no-console
    console.error('sign-in/email ล้มเหลว', signInRes.status, await signInRes.text());
    process.exit(1);
  }

  const cookies = signInRes.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) {
    // eslint-disable-next-line no-console
    console.error('ไม่มี Set-Cookie จาก sign-in — ตรวจ BETTER_AUTH_URL / trustedOrigins');
    process.exit(1);
  }

  const cookieHeader = joinCookieHeader(cookies);
  const sessionRes = await adminAuth.handler(
    new Request(`${base}/get-session`, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
        origin: devOrigin,
      },
    }),
  );

  const sessionJson = (await sessionRes.json()) as { session?: { id: string }; user?: { email: string } } | null;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        signInOk: true,
        getSessionOk: sessionRes.ok,
        sessionUserEmail: sessionJson && 'user' in sessionJson ? sessionJson.user?.email : null,
        sessionId: sessionJson && 'session' in sessionJson ? sessionJson.session?.id : null,
      },
      null,
      2,
    ),
  );

  if (!sessionRes.ok || !sessionJson?.user?.email) {
    process.exit(1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('pool timeout')) {
      // eslint-disable-next-line no-console
      console.error(
        'เชื่อม MariaDB/MySQL ไม่ได้ — เปิดฐานข้อมูลแล้วรันใหม่ หรือตรวจ DATABASE_URL ใน .env.dev',
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
