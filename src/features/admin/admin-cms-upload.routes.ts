/**
 * อัปโหลดรูป CMS (multipart) — บันทึกไฟล์แบบสตรีม แล้วอัปเดต URL ในฐานข้อมูล (ถ้า DB ล้มเหลวจะลบไฟล์)
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { unlink } from 'node:fs/promises';
import { jsonSuccess, jsonFailure } from '../../core/http/api-response.js';
import { badRequest, isAppError, notFound } from '../../core/http/errors.js';
import {
  extensionForMime,
  saveCmsImageFromWebStream,
} from '../cms/cms-upload.service.js';
import { adminGetArticle, adminGetPromotion, adminUpdateArticle, adminUpdatePromotion } from './admin.prisma-raw.js';

async function parseSingleImageFile(c: Context): Promise<File> {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file === 'string') {
    throw badRequest('ต้องแนบไฟล์ในฟิลด์ file');
  }
  if (!(file instanceof File)) {
    throw badRequest('รูปแบบไฟล์ไม่ถูกต้อง');
  }
  return file;
}

export function registerAdminCmsUploadRoutes(api: OpenAPIHono): void {
  api.post('/promotions/:id/image', async (c) => {
    const id = c.req.param('id');
    if (!id) return jsonFailure(c, { code: 'BAD_REQUEST', message: 'ไม่พบรหัส' }, 400);
    const row = await adminGetPromotion(id);
    if (!row) throw notFound('ไม่พบโปรโมชัน');

    let file: File;
    try {
      file = await parseSingleImageFile(c);
    } catch (e) {
      if (isAppError(e)) throw e;
      return jsonFailure(c, { code: 'BAD_REQUEST', message: (e as Error).message }, 400);
    }

    const mime = file.type || 'application/octet-stream';
    if (!extensionForMime(mime)) {
      return jsonFailure(c, { code: 'BAD_REQUEST', message: 'รองรับเฉพาะ JPEG, PNG, WebP, GIF' }, 400);
    }

    let absolutePath: string | undefined;
    try {
      const saved = await saveCmsImageFromWebStream({
        kind: 'promotion',
        entityId: id,
        mimeType: mime,
        webReadable: file.stream(),
      });
      absolutePath = saved.absolutePath;
      const updated = await adminUpdatePromotion(id, { image: saved.publicUrl });
      if (!updated) throw notFound('ไม่พบโปรโมชัน');
      return jsonSuccess(c, updated, { message: 'อัปโหลดรูปโปรโมชันแล้ว' });
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

  api.post('/articles/:id/cover', async (c) => {
    const id = c.req.param('id');
    if (!id) return jsonFailure(c, { code: 'BAD_REQUEST', message: 'ไม่พบรหัส' }, 400);
    const row = await adminGetArticle(id);
    if (!row) throw notFound('ไม่พบบทความ');

    let file: File;
    try {
      file = await parseSingleImageFile(c);
    } catch (e) {
      if (isAppError(e)) throw e;
      return jsonFailure(c, { code: 'BAD_REQUEST', message: (e as Error).message }, 400);
    }

    const mime = file.type || 'application/octet-stream';
    if (!extensionForMime(mime)) {
      return jsonFailure(c, { code: 'BAD_REQUEST', message: 'รองรับเฉพาะ JPEG, PNG, WebP, GIF' }, 400);
    }

    let absolutePath: string | undefined;
    try {
      const saved = await saveCmsImageFromWebStream({
        kind: 'article',
        entityId: id,
        mimeType: mime,
        webReadable: file.stream(),
      });
      absolutePath = saved.absolutePath;
      const updated = await adminUpdateArticle(id, { coverImage: saved.publicUrl });
      if (!updated) throw notFound('ไม่พบบทความ');
      return jsonSuccess(c, updated, { message: 'อัปโหลดรูปปกแล้ว' });
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
