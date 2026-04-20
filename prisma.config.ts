/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: คอนฟิก Prisma CLI (เส้นทาง schema/migrations/seed) และโหลดไฟล์ env ให้สอดคล้องกับแอป
 * - ใช้ในส่วนไหนของระบบ: คำสั่ง `prisma migrate`, `prisma generate`, `prisma db seed`
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `prisma/schema.prisma`, `prisma/seed.ts`
 *
 * 🧠 `datasourceUrl` มี placeholder เพื่อให้ generate ใน CI ได้แม้ยังไม่มี DB จริง — migrate ต้องใช้ URL จริง
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

/** โหลด env ให้สอดคล้องกับแอป (`src/core/env/config.ts`) — `dotenv/config` โหลดแค่ `.env` เท่านั้น */
const envFileCandidates = [
  process.env.DOTENV_PATH,
  process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev',
  '.env',
].filter(Boolean) as string[];

for (const file of envFileCandidates) {
  const full = resolve(process.cwd(), file);
  if (existsSync(full)) {
    loadEnv({ path: full });
    break;
  }
}

/** ใช้ตอน `prisma generate` / build CI ที่ยังไม่มี DATABASE_URL — migrate ต้องมีค่าจริง */
const datasourceUrl =
  process.env.DATABASE_URL ?? 'mysql://127.0.0.1:3306/__prisma_placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: datasourceUrl,
  },
});
