import { randomUUID } from 'node:crypto';

/** สร้างคีย์หลักแบบสตริงสำหรับ INSERT แบบ raw (แทน @default(cuid()) ของ Prisma ORM) */
export function newDbId(): string {
  return randomUUID();
}
