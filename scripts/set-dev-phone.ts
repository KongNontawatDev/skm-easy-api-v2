import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(process.cwd(), '.env.dev') });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
const r = await prisma.$executeRawUnsafe(
  'UPDATE `User` SET `phone` = ? WHERE `email` = ?',
  '0812345678',
  'admin@example.com',
);
console.log('updated rows', typeof r === 'number' ? r : Number(r));
await prisma.$disconnect();
