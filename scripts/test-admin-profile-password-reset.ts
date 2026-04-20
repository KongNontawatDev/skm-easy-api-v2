/**
 * ทดสอบ Better Auth แอดมิน: เข้าสู่ระบบ, อัปเดตชื่อ, เปลี่ยนรหัสผ่าน, ขอรีเซ็ตทางอีเมล + reset ด้วยโทเคน, คืนค่ารหัสเดิม
 *
 * รัน: npx tsx scripts/test-admin-profile-password-reset.ts
 * env: ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD (ค่าเริ่มต้นเหมือน seed)
 */
import { adminAuth } from '../src/features/admin-auth/better-auth.js';
import { prisma } from '../src/core/db/client.js';
import { env } from '../src/core/env/config.js';

const EMAIL = process.env.ADMIN_TEST_EMAIL ?? 'admin@example.com';
const ORIGINAL_PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? 'Admin1234!';
const ALT_PASSWORD = 'ResetFlowTest9!';
const DEV_ORIGIN = process.env.ADMIN_TEST_ORIGIN ?? 'http://localhost:5173';

function joinCookieHeader(setCookie: string[]): string {
  return setCookie
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  const base = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/v1/admin-auth`;
  return adminAuth.handler(
    new Request(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

async function getReq(path: string, headers: Record<string, string>): Promise<Response> {
  const base = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/v1/admin-auth`;
  return adminAuth.handler(
    new Request(`${base}${path}`, {
      method: 'GET',
      headers,
    }),
  );
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await postJson(
    '/sign-in/email',
    { email, password, rememberMe: true },
    { origin: DEV_ORIGIN },
  );
  if (!res.ok) {
    throw new Error(`sign-in failed ${res.status} ${await res.text()}`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookieHeader = joinCookieHeader(cookies);
  if (!cookieHeader) throw new Error('no session cookie from sign-in');
  return cookieHeader;
}

async function main() {
  const base = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/v1/admin-auth`;

  // 1) Sign in
  let cookie = await signIn(EMAIL, ORIGINAL_PASSWORD);

  // 2) Update display name
  const newName = `ทดสอบโปรไฟล์ ${Date.now()}`;
  const upd = await postJson('/update-user', { name: newName }, { origin: DEV_ORIGIN, cookie });
  if (!upd.ok) throw new Error(`update-user ${upd.status} ${await upd.text()}`);
  const sess1 = await getReq('/get-session', { origin: DEV_ORIGIN, cookie });
  const u1 = (await sess1.json()) as { user?: { name?: string } };
  if (u1.user?.name !== newName) throw new Error(`expected name ${newName}, got ${u1.user?.name}`);

  // 3) Change password (session)
  const midPassword = 'MidChangeTest9!';
  const ch = await postJson(
    '/change-password',
    { currentPassword: ORIGINAL_PASSWORD, newPassword: midPassword, revokeOtherSessions: false },
    { origin: DEV_ORIGIN, cookie },
  );
  if (!ch.ok) throw new Error(`change-password ${ch.status} ${await ch.text()}`);
  cookie = await signIn(EMAIL, midPassword);

  // 4) Change back via session to original (cleanup path A)
  const ch2 = await postJson(
    '/change-password',
    { currentPassword: midPassword, newPassword: ORIGINAL_PASSWORD, revokeOtherSessions: false },
    { origin: DEV_ORIGIN, cookie },
  );
  if (!ch2.ok) throw new Error(`change-password2 ${ch2.status} ${await ch2.text()}`);
  cookie = await signIn(EMAIL, ORIGINAL_PASSWORD);

  // 5) Request password reset (sends email)
  const redirectTo = `${DEV_ORIGIN}/reset-password`;
  const reqReset = await postJson(
    '/request-password-reset',
    { email: EMAIL, redirectTo },
    { origin: DEV_ORIGIN },
  );
  if (!reqReset.ok) {
    throw new Error(`request-password-reset ${reqReset.status} ${await reqReset.text()}`);
  }

  // 6) Find verification token in DB
  const vrows = await prisma.$queryRawUnsafe<
    { id: string; identifier: string; value: string; expiresAt: Date; createdAt: Date; updatedAt: Date }[]
  >(
    "SELECT `id`,`identifier`,`value`,`expiresAt`,`createdAt`,`updatedAt` FROM `admin_auth_verification` WHERE `identifier` LIKE 'reset-password:%' ORDER BY `createdAt` DESC LIMIT 1",
  );
  const row = vrows[0];
  if (!row) throw new Error('no reset-password verification row after request');
  const token = row.identifier.replace(/^reset-password:/, '');
  if (!token) throw new Error('empty token');

  // 7) GET callback → follow redirect Location
  const callbackRes = await adminAuth.handler(
    new Request(
      `${base}/reset-password/${token}?callbackURL=${encodeURIComponent(redirectTo)}`,
      { method: 'GET', headers: { origin: DEV_ORIGIN } },
    ),
  );
  if (callbackRes.status < 300 || callbackRes.status >= 400) {
    throw new Error(`reset callback expected redirect, got ${callbackRes.status} ${await callbackRes.text()}`);
  }
  const loc = callbackRes.headers.get('location');
  if (!loc) throw new Error('no Location header from reset callback');
  const locUrl = new URL(loc, base);
  const resetToken = locUrl.searchParams.get('token');
  if (!resetToken) throw new Error(`no token in redirect: ${loc}`);

  // 8) POST reset-password
  const resetBody = await postJson('/reset-password', { token: resetToken, newPassword: ALT_PASSWORD }, {
    origin: DEV_ORIGIN,
  });
  if (!resetBody.ok) throw new Error(`reset-password ${resetBody.status} ${await resetBody.text()}`);

  // 9–10) Sign in with new password, restore original password
  cookie = await signIn(EMAIL, ALT_PASSWORD);
  const restore = await postJson(
    '/change-password',
    { currentPassword: ALT_PASSWORD, newPassword: ORIGINAL_PASSWORD, revokeOtherSessions: false },
    { origin: DEV_ORIGIN, cookie },
  );
  if (!restore.ok) throw new Error(`restore password ${restore.status} ${await restore.text()}`);

  // 11) Restore display name (optional)
  cookie = await signIn(EMAIL, ORIGINAL_PASSWORD);
  await postJson('/update-user', { name: 'Administrator' }, { origin: DEV_ORIGIN, cookie });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        steps: [
          'sign-in',
          'update-user',
          'change-password x2',
          'request-password-reset',
          'reset-password-callback',
          'reset-password',
          'sign-in-new-password',
          'restore-password',
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
