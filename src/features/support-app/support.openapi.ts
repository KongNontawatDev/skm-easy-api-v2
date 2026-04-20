/**
 * ติดต่อสอบถาม — ลูกค้าแอปสร้าง ticket (JWT ลูกค้า)
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import { notFound } from '../../core/http/errors.js';
import { zSupportTicketDescription } from '../../core/validation/cms-html.js';

const ticketSelect = `SELECT \`id\`, \`idno\`, \`title\`, \`description\`, \`status\`,
  \`admin_reply\` AS adminReply, \`image_url\` AS imageUrl,
  \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`support_tickets\``;

type SupportTicketRow = {
  id: string;
  idno: string;
  title: string;
  description: string;
  status: string;
  adminReply: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function registerCustomerSupportRoutes(api: OpenAPIHono) {
  const list = createRoute({
    method: 'get',
    path: '/me/support/tickets',
    tags: ['Customer Support'],
    responses: { 200: openapiJsonSuccess(z.array(z.any()), 'ตั๋ว'), ...openapiStandardErrors },
  });
  api.openapi(list, async (c) => {
    const auth = c.get('auth')!;
    const rows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(
      `${ticketSelect} WHERE \`idno\` = ? ORDER BY \`created_at\` DESC LIMIT 100`,
      auth.id,
    );
    return jsonSuccess(c, rows, { message: 'รายการติดต่อ' });
  });

  const getOne = createRoute({
    method: 'get',
    path: '/me/support/tickets/{id}',
    tags: ['Customer Support'],
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.any(), 'ตั๋ว'), ...openapiStandardErrors },
  });
  api.openapi(getOne, async (c) => {
    const auth = c.get('auth')!;
    const { id } = c.req.valid('param');
    const rows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(
      `${ticketSelect} WHERE \`id\` = ? AND \`idno\` = ? LIMIT 1`,
      id,
      auth.id,
    );
    const row = rows[0];
    if (!row) throw notFound('ไม่พบเรื่องที่แจ้ง');
    return jsonSuccess(c, row, { message: 'ตั๋ว' });
  });

  const create = createRoute({
    method: 'post',
    path: '/me/support/tickets',
    tags: ['Customer Support'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              title: z.string().min(3).max(200),
              description: zSupportTicketDescription,
            }),
          },
        },
      },
    },
    responses: { 201: openapiJsonSuccess(z.any(), 'สร้างตั๋ว'), ...openapiStandardErrors },
  });
  api.openapi(create, async (c) => {
    const auth = c.get('auth')!;
    const body = c.req.valid('json');
    const tid = newDbId();
    const t = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `support_tickets` (`id`,`idno`,`title`,`description`,`status`,`admin_reply`,`image_url`,`created_at`,`updated_at`) VALUES (?,?,?,?,?,?,?,?,?)',
      tid,
      auth.id,
      body.title,
      body.description,
      'open',
      null,
      null,
      t,
      t,
    );
    const rows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(`${ticketSelect} WHERE \`id\` = ? LIMIT 1`, tid);
    const row = rows[0]!;
    return jsonSuccess(c, row, { status: 201, message: 'ส่งข้อความถึงเจ้าหน้าที่แล้ว' });
  });
}
