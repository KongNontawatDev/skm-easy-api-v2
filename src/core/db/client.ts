/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: สร้าง singleton `PrismaClient` ที่เชื่อม MariaDB ผ่าน adapter อย่างเป็นทางการของ Prisma 6+
 * - ใช้ในส่วนไหนของระบบ: repository/feature ทุกตัวที่เขียน/อ่าน DB (ห้าม import Prisma ตรงจากที่อื่นนอก pattern โปรเจกต์)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `prisma/schema.prisma`, ทุก `*.repo.ts`
 *
 * 🧠 เทคนิค: ใน dev เก็บ client บน `globalThis` เพื่อกันการสร้าง connection ซ้ำตอน hot reload
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { env } from '../env/config.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaMariaDb(env.DATABASE_URL),
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
