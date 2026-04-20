/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: route อ่านการแจ้งเตือน in-app ที่บันทึกจาก worker/notification processor
 * - ใช้ในส่วนไหนของระบบ: `public.router.ts` ภายใต้ auth
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `notifications.service.ts`
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import {
  listPaginationMeta,
  paginatedListDataSchema,
  paginationQuerySchema,
} from '../../core/http/pagination.js';
import { notificationsService } from './notifications.service.js';

/** 📌 ลงทะเบียน `/notifications` (รายการของลูกค้าที่ล็อกอิน — กรองด้วย `idno`) */
export function registerNotificationRoutes(api: OpenAPIHono) {
  const list = createRoute({
    method: 'get',
    path: '/notifications',
    tags: ['Notifications'],
    request: { query: paginationQuerySchema },
    responses: {
      200: openapiJsonSuccess(paginatedListDataSchema(z.any()), 'รายการแจ้งเตือน'),
      ...openapiStandardErrors,
    },
  });

  api.openapi(list, async (c) => {
    const auth = c.get('auth');
    const q = c.req.valid('query');
    const body = await notificationsService.list(auth!.id, q);
    return jsonSuccess(c, { items: body.items }, {
      message: 'ดึงการแจ้งเตือนสำเร็จ',
      meta: listPaginationMeta({
        page: body.page,
        limit: body.limit,
        count: body.items.length,
        total: body.total,
        hasMore: body.hasMore,
      }),
    });
  });

  const markRead = createRoute({
    method: 'patch',
    path: '/notifications/{id}/read',
    tags: ['Notifications'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.object({ updated: z.number() }), 'อ่านแล้ว'), ...openapiStandardErrors },
  });
  api.openapi(markRead, async (c) => {
    const auth = c.get('auth')!;
    const { id } = c.req.valid('param');
    const n = await notificationsService.markRead(auth.id, id);
    return jsonSuccess(c, { updated: n }, { message: n ? 'ทำเครื่องหมายอ่านแล้ว' : 'ไม่พบรายการ' });
  });
}
