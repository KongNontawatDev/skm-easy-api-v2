import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { badRequest, notFound, unauthorized } from '../../core/http/errors.js';
import { usersService } from './users.service.js';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';

const profileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  isStaff: z.boolean(),
  roles: z.array(z.string()),
});

export function registerUserRoutes(api: OpenAPIHono) {
  const me = createRoute({
    method: 'get',
    path: '/users/me',
    tags: ['Users'],
    responses: {
      200: openapiJsonSuccess(profileSchema, 'โปรไฟล์ผู้ใช้'),
      ...openapiStandardErrors,
    },
  });

  api.openapi(me, async (c) => {
    const auth = c.get('auth');
    if (!auth) throw unauthorized('ต้องล็อกอิน');
    if (auth.roles.includes('customer')) {
      throw badRequest('ลูกค้าแอปใช้ GET /api/v1/me/profile');
    }
    const profile = await usersService.getMe(auth.id);
    if (!profile) throw notFound('ไม่พบผู้ใช้');
    return jsonSuccess(c, profile, { message: 'ดึงข้อมูลผู้ใช้สำเร็จ' });
  });
}
