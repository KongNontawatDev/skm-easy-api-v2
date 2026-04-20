import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.dev') });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
const { prisma } = await import('../src/core/db/client.js');
const r = await prisma.$executeRawUnsafe(
  'UPDATE `User` SET `phone` = ? WHERE `email` = ?',
  '0812345678',
  'admin@example.com',
);
console.log('updated rows', typeof r === 'number' ? r : Number(r));
await prisma.$disconnect();
