/**
 * เสิร์ฟไฟล์ CMS แบบสาธารณะ (GET) — ไม่ต้อง auth
 */
import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { serveCmsFile } from './cms-upload.service.js';

export function buildCmsPublicFilesRouter() {
  const r = new Hono();
  r.get('/*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const marker = '/public/files/';
    const idx = pathname.indexOf(marker);
    const rel = idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\/+/, '');
    if (!rel || rel.includes('..')) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์' } }, 404);
    }
    const meta = await serveCmsFile(rel);
    if (!meta) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์' } }, 404);
    }
    const webStream = Readable.toWeb(createReadStream(meta.path)) as unknown as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': meta.mime,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  });
  return r;
}
