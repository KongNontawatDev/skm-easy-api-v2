/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: รายการแจ้งเตือนของลูกค้าปัจจุบันแบบ page/limit (กรองด้วย `idno` = JWT `sub`)
 * - ใช้ในส่วนไหนของระบบ: `notifications.openapi.ts`
 */
import {
  resolvePagination,
  trimToPage,
  type PaginatedListResult,
  type PaginationQuery,
} from '../../core/http/pagination.js';
import { notificationsRepo } from './notifications.repo.js';

export const notificationsService = {
  async list(customerIdno: string, params?: PaginationQuery): Promise<PaginatedListResult<unknown>> {
    const { page, limit } = resolvePagination(params ?? {});
    const [rows, total] = await Promise.all([
      notificationsRepo.listForCustomer(customerIdno, { page, limit }),
      notificationsRepo.countForCustomer(customerIdno),
    ]);
    const { items, hasMore } = trimToPage(rows, limit);
    return { items, page, limit, hasMore, total };
  },

  async markRead(customerIdno: string, id: string): Promise<number> {
    return notificationsRepo.markRead(customerIdno, id);
  },
};
