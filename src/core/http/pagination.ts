/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: query Zod + helper แบ่งหน้าแบบ page/limit + hasMore (offset) ใช้ร่วมหลายฟีเจอร์
 * - ใช้ในส่วนไหนของระบบ: OpenAPI routes + service รายการแบ่งหน้าแบบ offset (`page`/`limit`) — ไม่ใช้ cursor / nextCursor
 */
import { z } from '@hono/zod-openapi';

export const DEFAULT_LIST_PAGE = 1;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_PAGE = 10_000;
export const MAX_LIST_LIMIT = 100;

/** query string มาตรฐาน: page / limit (optional → default) */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_LIST_PAGE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PaginatedListResult<T> = {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
};

export function resolvePagination(params: PaginationQuery): { page: number; limit: number } {
  return {
    page: params.page ?? DEFAULT_LIST_PAGE,
    limit: params.limit ?? DEFAULT_LIST_LIMIT,
  };
}

/** แถวจาก DB ต้องเป็น take = limit + 1 แล้วตัดเหลือ limit + คำนวณ hasMore */
export function trimToPage<T>(rows: readonly T[], limit: number): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : [...rows];
  return { items, hasMore };
}

/** ค่า meta มาตรฐานสำหรับรายการแบ่งหน้า — ใช้รวมกับ `buildResponseMeta` ใน `jsonSuccess` */
export function listPaginationMeta(input: {
  page: number;
  limit: number;
  count: number;
  total: number;
  /** ยังมีหน้าถัดไปหรือไม่ (คำนวณจาก offset + จำนวนแถว ไม่ใช้ cursor) */
  hasMore: boolean;
}) {
  return {
    page: input.page,
    limit: input.limit,
    count: input.count,
    total: input.total,
    has_more: input.hasMore,
  };
}

/** envelope ของ `data` สำหรับรายการแบ่งหน้า — ตัวเลขแบ่งหน้าอยู่ใน `meta` (page, limit, count, total, has_more) */
export function paginatedListDataSchema(itemSchema: z.ZodTypeAny = z.any()) {
  return z.object({
    items: z.array(itemSchema),
  });
}
