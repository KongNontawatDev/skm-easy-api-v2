/**
 * อัปโหลดรูปประกอบตั๋วแจ้งปัญหา (ลูกค้าแอป — JWT ลูกค้า)
 * ได้เพียง 1 รูปต่อตั๋ว — อัปโหลดซ้ำจะแทนที่รูปเดิม
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { unlink } from 'node:fs/promises';
import { prisma } from '../../core/db/client.js';
import { jsonSuccess, jsonFailure } from '../../core/http/api-response.js';
import { badRequest, isAppError, notFound } from '../../core/http/errors.js';
import { extensionForMime, saveSupportTicketSingleImageFromWebStream } from '../cms/cms-upload.service.js';

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

function isBlobLike(x: unknown): x is Blob {
  return (
    typeof x === 'object' &&
    x != null &&
    typeof (x as Blob).stream === 'function' &&
    typeof (x as Blob).arrayBuffer === 'function'
  );
}

async function parseSingleImageBody(c: Context): Promise<{ stream: () => ReadableStream<Uint8Array>; type: string }> {
  const body = await c.req.parseBody();
  let raw = body['file'];
  if (Array.isArray(raw)) raw = raw[0];
  if (raw == null || typeof raw === 'string') {
    throw badRequest('ต้องแนบไฟล์ในฟิลด์ file');
  }
  if (!isBlobLike(raw)) {
    throw badRequest('รูปแบบไฟล์ไม่ถูกต้อง');
  }
  const blob = raw;
  return {
    stream: () => blob.stream(),
    type: blob.type || 'application/octet-stream',
  };
}

export function registerCustomerSupportUploadRoutes(api: OpenAPIHono): void {
  api.post('/me/support/tickets/:id/image', async (c) => {
    const auth = c.get('auth');
    if (!auth?.id) {
      return jsonFailure(c, { code: 'UNAUTHORIZED', message: 'ต้องล็อกอิน' }, 401);
    }
    const id = c.req.param('id');
    if (!id) return jsonFailure(c, { code: 'BAD_REQUEST', message: 'ไม่พบรหัสตั๋ว' }, 400);

    const rows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(
      `${ticketSelect} WHERE \`id\` = ? AND \`idno\` = ? LIMIT 1`,
      id,
      auth.id,
    );
    const row = rows[0];
    if (!row) throw notFound('ไม่พบเรื่องที่แจ้ง');
    if (row.status === 'closed') {
      return jsonFailure(c, { code: 'BAD_REQUEST', message: 'ปิดเรื่องแล้ว ไม่สามารถแนบรูปเพิ่มได้' }, 400);
    }

    let bodyFile: { stream: () => ReadableStream<Uint8Array>; type: string };
    try {
      bodyFile = await parseSingleImageBody(c);
    } catch (e) {
      if (isAppError(e)) throw e;
      return jsonFailure(c, { code: 'BAD_REQUEST', message: (e as Error).message }, 400);
    }

    const mime = bodyFile.type || 'application/octet-stream';
    if (!extensionForMime(mime)) {
      return jsonFailure(c, { code: 'BAD_REQUEST', message: 'รองรับเฉพาะ JPEG, PNG, WebP, GIF' }, 400);
    }

    let absolutePath: string | undefined;
    try {
      const saved = await saveSupportTicketSingleImageFromWebStream({
        ticketId: id,
        mimeType: mime,
        webReadable: bodyFile.stream(),
      });
      absolutePath = saved.absolutePath;
      const now = new Date();
      await prisma.$executeRawUnsafe(
        'UPDATE `support_tickets` SET `image_url` = ?, `updated_at` = ? WHERE `id` = ?',
        saved.publicUrl,
        now,
        id,
      );
      const updatedRows = await prisma.$queryRawUnsafe<SupportTicketRow[]>(
        `${ticketSelect} WHERE \`id\` = ? LIMIT 1`,
        id,
      );
      const updated = updatedRows[0]!;
      return jsonSuccess(c, updated, { message: 'อัปโหลดรูปแล้ว' });
    } catch (err) {
      if (absolutePath) {
        try {
          await unlink(absolutePath);
        } catch {
          /* */
        }
      }
      const msg = (err as Error).message;
      if (msg === 'FILE_TOO_LARGE') {
        return jsonFailure(c, { code: 'PAYLOAD_TOO_LARGE', message: 'ไฟล์ใหญ่เกินขีดจำกัด' }, 413);
      }
      throw err;
    }
  });
}
