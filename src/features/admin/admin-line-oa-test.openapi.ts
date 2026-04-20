/**
 * OpenAPI routes — เครื่องมือทดสอบ LINE OA (แอดมิน)
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  apiFailureEnvelopeSchema,
  jsonSuccess,
  openapiJsonSuccess,
  openapiStandardErrors,
} from '../../core/http/api-response.js';
import { badRequest } from '../../core/http/errors.js';
import {
  adminLineOaTestPush,
  adminLineOaTestTemplateList,
  isLineOaTestTemplate,
} from './admin-line-oa-test.service.js';

const templateRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  channel: z.string(),
});

const testPushResultSchema = z.object({
  lineUserIdMasked: z.string(),
  template: z.string(),
  channel: z.string(),
});

export function registerAdminLineOaTestRoutes(api: OpenAPIHono): void {
  const templatesRoute = createRoute({
    method: 'get',
    path: '/tools/line-oa/templates',
    tags: ['Admin LINE OA Test'],
    responses: {
      200: openapiJsonSuccess(z.array(templateRowSchema), 'รายการเทมเพลตทดสอบ'),
      ...openapiStandardErrors,
    },
  });
  api.openapi(templatesRoute, async (c) => {
    const rows = adminLineOaTestTemplateList();
    return jsonSuccess(c, rows, { message: 'เทมเพลต LINE OA' });
  });

  const testPushRoute = createRoute({
    method: 'post',
    path: '/tools/line-oa/test-push',
    tags: ['Admin LINE OA Test'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              legacyCustomerId: z.string().min(1),
              template: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(testPushResultSchema, 'ส่งข้อความทดสอบแล้ว'),
      ...openapiStandardErrors,
      503: {
        description: 'บริการไม่พร้อม',
        content: {
          'application/json': { schema: apiFailureEnvelopeSchema },
        },
      },
    },
  });
  api.openapi(testPushRoute, async (c) => {
    const body = c.req.valid('json');
    if (!isLineOaTestTemplate(body.template)) {
      throw badRequest('เทมเพลตไม่ถูกต้อง');
    }
    const result = await adminLineOaTestPush(body.legacyCustomerId, body.template);
    return jsonSuccess(c, result, { message: 'ส่งข้อความทดสอบแล้ว' });
  });
}
