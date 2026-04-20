/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - ลงทะเบียน route OpenAPI สำหรับโปรโมชัน / บทความ / คู่มือ (อ่านสาธารณะ)
 * - delegate ไป `cmsPublic.service` อ่านจาก DB
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import { notFound } from '../../core/http/errors.js';
import { cmsPublicService } from './cms-public.service.js';

const promotionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export function registerPublicCmsRoutes(api: OpenAPIHono) {
  const promos = createRoute({
    method: 'get',
    path: '/public/promotions',
    tags: ['Public CMS'],
    responses: { 200: openapiJsonSuccess(z.array(promotionSchema), 'โปรโมชัน'), ...openapiStandardErrors },
  });
  api.openapi(promos, async (c) => {
    const body = await cmsPublicService.listPromotionsActive();
    return jsonSuccess(c, body, { message: 'รายการโปรโมชัน' });
  });

  const promoById = createRoute({
    method: 'get',
    path: '/public/promotions/{id}',
    tags: ['Public CMS'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(promotionSchema, 'โปรโมชัน'), ...openapiStandardErrors },
  });
  api.openapi(promoById, async (c) => {
    const { id } = c.req.valid('param');
    const row = await cmsPublicService.getPromotionByIdActive(id);
    if (!row) throw notFound('ไม่พบโปรโมชัน');
    return jsonSuccess(c, row, { message: 'โปรโมชัน' });
  });

  const articles = createRoute({
    method: 'get',
    path: '/public/articles',
    tags: ['Public CMS'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'บทความ'), ...openapiStandardErrors },
  });
  api.openapi(articles, async (c) => {
    const rows = await cmsPublicService.listArticlesPublished();
    return jsonSuccess(c, rows, { message: 'บทความ' });
  });

  const guides = createRoute({
    method: 'get',
    path: '/public/guides',
    tags: ['Public CMS'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'คู่มือ'), ...openapiStandardErrors },
  });
  api.openapi(guides, async (c) => {
    const rows = await cmsPublicService.listGuidesOrdered();
    return jsonSuccess(c, rows, { message: 'คู่มือการใช้งาน' });
  });

  const articleById = createRoute({
    method: 'get',
    path: '/public/articles/{id}',
    tags: ['Public CMS'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.any(), 'บทความ'), ...openapiStandardErrors },
  });
  api.openapi(articleById, async (c) => {
    const { id } = c.req.valid('param');
    const row = await cmsPublicService.getArticleByIdPublished(id);
    if (!row) throw notFound('ไม่พบบทความ');
    return jsonSuccess(c, row, { message: 'บทความ' });
  });

  const guideById = createRoute({
    method: 'get',
    path: '/public/guides/{id}',
    tags: ['Public CMS'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.any(), 'คู่มือ'), ...openapiStandardErrors },
  });
  api.openapi(guideById, async (c) => {
    const { id } = c.req.valid('param');
    const row = await cmsPublicService.getGuideById(id);
    if (!row) throw notFound('ไม่พบคู่มือ');
    return jsonSuccess(c, row, { message: 'คู่มือ' });
  });
}
