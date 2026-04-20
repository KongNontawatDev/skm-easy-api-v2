/**
 * Seed ขั้นต่ำ: แอดมิน Better Auth (ตาราง admin_auth_*) + โปรโมชันตัวอย่าง
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/core/db/client.js';

async function main() {
  const adminEmail = 'admin@example.com';
  const adminPassword = 'Admin1234!';

  const existingRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    'SELECT `id` FROM `admin_auth_user` WHERE `email` = ? LIMIT 1',
    adminEmail,
  );
  if (!existingRows.length) {
    const userId = randomUUID();
    const passwordHash = await hashPassword(adminPassword);
    const accountId = randomUUID();
    const now = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `admin_auth_user` (`id`,`name`,`email`,`emailVerified`,`image`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?)',
      userId,
      'Administrator',
      adminEmail,
      true,
      null,
      now,
      now,
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO `admin_auth_account` (`id`,`accountId`,`providerId`,`userId`,`password`,`createdAt`,`updatedAt`) VALUES (?,?,?,?,?,?,?)',
      randomUUID(),
      userId,
      'credential',
      userId,
      passwordHash,
      now,
      now,
    );
  }

  const promoId = 'seed-welcome-promo';
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    'SELECT `id` FROM `promotions` WHERE `id` = ? LIMIT 1',
    promoId,
  );
  const now = new Date();
  if (!rows.length) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`promotions\` (\`id\`,\`title\`,\`description\`,\`image\`,\`start_date\`,\`end_date\`,\`is_active\`,\`created_at\`,\`updated_at\`)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      promoId,
      'ยินดีต้อนรับสู่ SKM Easy',
      'การตัดงวดทำที่ระบบหลักขององค์กร — แจ้งผ่าน LINE / แอป',
      null,
      null,
      null,
      true,
      now,
      now,
    );
  } else {
    await prisma.$executeRawUnsafe(
      'UPDATE `promotions` SET `title` = ?, `updated_at` = ? WHERE `id` = ?',
      'ยินดีต้อนรับสู่ SKM Easy',
      now,
      promoId,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        adminEmail,
        adminPassword,
        hint: 'ล็อกอินแอดมินผ่าน Better Auth ที่ /api/v1/admin-auth — ตั้ง BETTER_AUTH_URL ใน env ของ API',
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
