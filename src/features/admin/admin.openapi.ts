/**
 * แอดมิน: แดชบอร์ด, CRUD เนื้อหา, ตอบ ticket — ต้อง JWT + isStaff (role staff)
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import { notFound } from '../../core/http/errors.js';
import { requireStaff } from '../../core/security/staff.middleware.js';
import { zCmsHtml, zCmsHtmlOpt } from '../../core/validation/cms-html.js';
import {
  deleteStoredEntityImages,
  isStoredCmsFileUrl,
} from '../cms/cms-upload.service.js';
import { registerAdminCmsUploadRoutes } from './admin-cms-upload.routes.js';
import { registerAdminLineOaTestRoutes } from './admin-line-oa-test.openapi.js';
import { MYSQL_ERR_NO_SUCH_TABLE, mysqlErrno } from '../../core/db/mysql-errors.js';
import {
  adminCreateArticle,
  adminCreateGuide,
  adminCreatePromotion,
  adminDashboardCounts,
  adminDeleteArticle,
  adminDeleteGuide,
  adminDeletePromotion,
  adminGetArticle,
  adminGetGuide,
  adminGetPromotion,
  adminListArticles,
  adminListAuthUsers,
  adminListCustomerLiffLinks,
  adminListGuides,
  adminListLegacyStaffUsers,
  adminListPromotions,
  adminListSupportTickets,
  adminReplySupportTicket,
  adminUpdateArticle,
  adminUpdateGuide,
  adminUpdatePromotion,
} from './admin.db-raw.js';

export function registerAdminRoutes(api: OpenAPIHono) {
  api.use('*', requireStaff);

  const dash = createRoute({
    method: 'get',
    path: '/dashboard/summary',
    tags: ['Admin Dashboard'],
    responses: { 200: openapiJsonSuccess(z.any(), 'สรุป'), ...openapiStandardErrors },
  });
  api.openapi(dash, async (c) => {
    const { openTickets, adminUserCount } = await adminDashboardCounts();
    return jsonSuccess(
      c,
      { openTickets, adminUserCount },
      { message: 'สรุปแดชบอร์ด' },
    );
  });

  const promoList = createRoute({
    method: 'get',
    path: '/promotions',
    tags: ['Admin Promotions'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'รายการ'), ...openapiStandardErrors },
  });
  const promoCreate = createRoute({
    method: 'post',
    path: '/promotions',
    tags: ['Admin Promotions'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1),
              description: zCmsHtml,
              image: z.string().url().optional(),
              startDate: z.string().datetime().optional(),
              endDate: z.string().datetime().optional(),
              isActive: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 201: openapiJsonSuccess(z.any(), 'สร้าง'), ...openapiStandardErrors },
  });
  api.openapi(promoList, async (c) => {
    const rows = await adminListPromotions();
    return jsonSuccess(c, rows, { message: 'โปรโมชัน' });
  });
  api.openapi(promoCreate, async (c) => {
    const body = c.req.valid('json');
    const row = await adminCreatePromotion({
      title: body.title,
      description: body.description,
      image: body.image,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      isActive: body.isActive ?? true,
    });
    return jsonSuccess(c, row, { status: 201, message: 'สร้างโปรโมชันแล้ว' });
  });

  const ticketList = createRoute({
    method: 'get',
    path: '/support/tickets',
    tags: ['Admin Support'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'tickets'), ...openapiStandardErrors },
  });
  const ticketReply = createRoute({
    method: 'post',
    path: '/support/tickets/{id}/reply',
    tags: ['Admin Support'],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              adminReply: zCmsHtml,
              status: z.enum(['replied', 'closed']).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.any(), 'ตอบแล้ว'), ...openapiStandardErrors },
  });
  api.openapi(ticketList, async (c) => {
    const rows = await adminListSupportTickets();
    return jsonSuccess(c, rows, { message: 'ตั๋วทั้งหมด' });
  });
  api.openapi(ticketReply, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await adminReplySupportTicket(id, body.adminReply, body.status ?? 'replied');
    return jsonSuccess(c, row, { message: 'บันทึกคำตอบแล้ว' });
  });

  const promoPatch = createRoute({
    method: 'patch',
    path: '/promotions/{id}',
    tags: ['Admin Promotions'],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1).optional(),
              description: zCmsHtmlOpt,
              image: z.string().url().optional().nullable(),
              startDate: z.string().datetime().optional().nullable(),
              endDate: z.string().datetime().optional().nullable(),
              isActive: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.any(), 'อัปเดต'), ...openapiStandardErrors },
  });
  api.openapi(promoPatch, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const prev = await adminGetPromotion(id);
    if (!prev) throw notFound('ไม่พบโปรโมชัน');
    const row = await adminUpdatePromotion(id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.image !== undefined ? { image: body.image } : {}),
      ...(body.startDate !== undefined
        ? { startDate: body.startDate ? new Date(body.startDate) : null }
        : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    if (body.image !== undefined) {
      const prevLocal = isStoredCmsFileUrl(prev.image);
      const next = body.image;
      const nextLocal = next ? isStoredCmsFileUrl(next) : false;
      if (prevLocal && (next === null || !nextLocal || next !== prev.image)) {
        await deleteStoredEntityImages('promotions', id);
      }
    }
    return jsonSuccess(c, row, { message: 'อัปเดตโปรโมชันแล้ว' });
  });

  const promoDelete = createRoute({
    method: 'delete',
    path: '/promotions/{id}',
    tags: ['Admin Promotions'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.object({ id: z.string() }), 'ลบแล้ว'), ...openapiStandardErrors },
  });
  api.openapi(promoDelete, async (c) => {
    const { id } = c.req.valid('param');
    const prev = await adminGetPromotion(id);
    if (!prev) throw notFound('ไม่พบโปรโมชัน');
    if (prev.image && isStoredCmsFileUrl(prev.image)) {
      await deleteStoredEntityImages('promotions', id);
    }
    await adminDeletePromotion(id);
    return jsonSuccess(c, { id }, { message: 'ลบโปรโมชันแล้ว' });
  });

  const usersList = createRoute({
    method: 'get',
    path: '/users',
    tags: ['Admin Users'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'ผู้ใช้'), ...openapiStandardErrors },
  });
  api.openapi(usersList, async (c) => {
    const admins = await adminListAuthUsers();
    const rows: Array<{
      id: string;
      email: string;
      name: string | null;
      isActive: boolean;
      roles: string[];
      createdAt: Date;
    }> = admins.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: true,
      roles: ['staff'],
      createdAt: u.createdAt,
    }));

    try {
      const legacyStaff = await adminListLegacyStaffUsers();
      const seen = new Set(rows.map((r) => r.email.toLowerCase()));
      for (const u of legacyStaff) {
        const key = u.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          id: u.id,
          email: u.email,
          name: u.name,
          isActive: u.isActive,
          roles: ['staff'],
          createdAt: u.createdAt,
        });
      }
    } catch (e) {
      if (mysqlErrno(e) !== MYSQL_ERR_NO_SUCH_TABLE) throw e;
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const limited = rows.slice(0, 200);
    return jsonSuccess(
      c,
      limited.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isActive: u.isActive,
        roles: u.roles,
        createdAt: u.createdAt,
      })),
      { message: 'รายชื่อผู้ใช้ระบบ' },
    );
  });

  const articlesList = createRoute({
    method: 'get',
    path: '/articles',
    tags: ['Admin Articles'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'บทความ'), ...openapiStandardErrors },
  });
  const articlesCreate = createRoute({
    method: 'post',
    path: '/articles',
    tags: ['Admin Articles'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1),
              content: zCmsHtml,
              coverImage: z.string().url().optional(),
              publishedAt: z.string().datetime().optional().nullable(),
            }),
          },
        },
      },
    },
    responses: { 201: openapiJsonSuccess(z.any(), 'สร้าง'), ...openapiStandardErrors },
  });
  const articlesPatch = createRoute({
    method: 'patch',
    path: '/articles/{id}',
    tags: ['Admin Articles'],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1).optional(),
              content: zCmsHtmlOpt,
              coverImage: z.string().url().optional().nullable(),
              publishedAt: z.string().datetime().optional().nullable(),
            }),
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.any(), 'อัปเดต'), ...openapiStandardErrors },
  });
  api.openapi(articlesList, async (c) => {
    const rows = await adminListArticles();
    return jsonSuccess(c, rows, { message: 'บทความ' });
  });
  api.openapi(articlesCreate, async (c) => {
    const body = c.req.valid('json');
    const row = await adminCreateArticle({
      title: body.title,
      content: body.content,
      coverImage: body.coverImage,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
    });
    return jsonSuccess(c, row, { status: 201, message: 'สร้างบทความแล้ว' });
  });
  api.openapi(articlesPatch, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const prev = await adminGetArticle(id);
    if (!prev) throw notFound('ไม่พบบทความ');
    const row = await adminUpdateArticle(id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.coverImage !== undefined ? { coverImage: body.coverImage } : {}),
      ...(body.publishedAt !== undefined
        ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null }
        : {}),
    });
    if (!row) throw notFound('ไม่พบบทความ');
    if (body.coverImage !== undefined) {
      const prevLocal = isStoredCmsFileUrl(prev.coverImage);
      const next = body.coverImage;
      const nextLocal = next ? isStoredCmsFileUrl(next) : false;
      if (prevLocal && (next === null || !nextLocal || next !== prev.coverImage)) {
        await deleteStoredEntityImages('articles', id);
      }
    }
    return jsonSuccess(c, row, { message: 'อัปเดตบทความแล้ว' });
  });

  const articlesDelete = createRoute({
    method: 'delete',
    path: '/articles/{id}',
    tags: ['Admin Articles'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.object({ id: z.string() }), 'ลบแล้ว'), ...openapiStandardErrors },
  });
  api.openapi(articlesDelete, async (c) => {
    const { id } = c.req.valid('param');
    const prev = await adminGetArticle(id);
    if (!prev) throw notFound('ไม่พบบทความ');
    if (prev.coverImage && isStoredCmsFileUrl(prev.coverImage)) {
      await deleteStoredEntityImages('articles', id);
    }
    await adminDeleteArticle(id);
    return jsonSuccess(c, { id }, { message: 'ลบบทความแล้ว' });
  });

  const guidesList = createRoute({
    method: 'get',
    path: '/guides',
    tags: ['Admin Guides'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'คู่มือ'), ...openapiStandardErrors },
  });
  const guidesCreate = createRoute({
    method: 'post',
    path: '/guides',
    tags: ['Admin Guides'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1),
              content: zCmsHtml,
              sortOrder: z.number().int().optional(),
            }),
          },
        },
      },
    },
    responses: { 201: openapiJsonSuccess(z.any(), 'สร้าง'), ...openapiStandardErrors },
  });
  const guidesPatch = createRoute({
    method: 'patch',
    path: '/guides/{id}',
    tags: ['Admin Guides'],
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(1).optional(),
              content: zCmsHtmlOpt,
              sortOrder: z.number().int().optional(),
            }),
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.any(), 'อัปเดต'), ...openapiStandardErrors },
  });
  api.openapi(guidesList, async (c) => {
    const rows = await adminListGuides();
    return jsonSuccess(c, rows, { message: 'คู่มือ' });
  });
  api.openapi(guidesCreate, async (c) => {
    const body = c.req.valid('json');
    const row = await adminCreateGuide({
      title: body.title,
      content: body.content,
      sortOrder: body.sortOrder ?? 0,
    });
    return jsonSuccess(c, row, { status: 201, message: 'สร้างคู่มือแล้ว' });
  });
  api.openapi(guidesPatch, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await adminUpdateGuide(id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    });
    if (!row) throw notFound('ไม่พบคู่มือ');
    return jsonSuccess(c, row, { message: 'อัปเดตคู่มือแล้ว' });
  });

  const guidesDelete = createRoute({
    method: 'delete',
    path: '/guides/{id}',
    tags: ['Admin Guides'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.object({ id: z.string() }), 'ลบแล้ว'), ...openapiStandardErrors },
  });
  api.openapi(guidesDelete, async (c) => {
    const { id } = c.req.valid('param');
    const prev = await adminGetGuide(id);
    if (!prev) throw notFound('ไม่พบคู่มือ');
    await adminDeleteGuide(id);
    return jsonSuccess(c, { id }, { message: 'ลบคู่มือแล้ว' });
  });

  const liffLinksList = createRoute({
    method: 'get',
    path: '/customer-liff-links',
    tags: ['Admin Customer LIFF'],
    request: {
      query: z.object({
        legacyCustomerId: z.string().min(1).optional(),
        take: z.coerce.number().min(1).max(500).optional(),
      }),
    },
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'รายการผูก LINE'), ...openapiStandardErrors },
  });
  api.openapi(liffLinksList, async (c) => {
    const q = c.req.valid('query');
    const rows = await adminListCustomerLiffLinks(q.legacyCustomerId, q.take ?? 200);
    return jsonSuccess(c, rows, { message: 'การผูก LINE ลูกค้า' });
  });

  registerAdminLineOaTestRoutes(api);
  registerAdminCmsUploadRoutes(api);
}
