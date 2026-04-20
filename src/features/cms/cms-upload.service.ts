/**
 * บันทึกไฟล์รูป CMS ลงดิสก์ + URL สาธารณะ — ใช้สตรีมจาก multipart (ไม่โหลดทั้งไฟล์ลงหน่วยความจำ)
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rmdir, unlink, stat } from 'node:fs/promises';
import { dirname, join, resolve, normalize, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_UPLOAD_IMAGE_BYTES, UPLOAD_ROOT } from '../../core/constants.js';

/** URL ที่เก็บใน DB (path สัมพัทธ์ — ต่อกับ origin ของ API) */
export const CMS_FILES_URL_PREFIX = '/api/v1/public/files/';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function uploadRootAbs(): string {
  return resolve(process.cwd(), UPLOAD_ROOT);
}

export function publicUrlForCmsFile(relativeUnderCms: string): string {
  const rel = relativeUnderCms.replace(/^\/+/, '');
  return `${CMS_FILES_URL_PREFIX}${rel}`;
}

export function isStoredCmsFileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith(CMS_FILES_URL_PREFIX);
}

function safeResolveUnderUpload(rel: string): string {
  const cmsRoot = join(uploadRootAbs(), 'cms');
  const normalized = normalize(join(cmsRoot, rel));
  const rootWithSep = cmsRoot.endsWith(sep) ? cmsRoot : cmsRoot + sep;
  if (!normalized.startsWith(rootWithSep) && normalized !== cmsRoot) {
    throw new Error('path_escape');
  }
  return normalized;
}

export async function ensureCmsDirs(): Promise<void> {
  const root = uploadRootAbs();
  await mkdir(join(root, 'cms', 'promotions'), { recursive: true });
  await mkdir(join(root, 'cms', 'articles'), { recursive: true });
  await mkdir(join(root, 'cms', 'support-tickets'), { recursive: true });
}

function byteLimitTransform(maxBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > maxBytes) {
        cb(new Error('FILE_TOO_LARGE'));
        return;
      }
      cb(null, chunk);
    },
  });
}

export function extensionForMime(mime: string): string | null {
  const m = mime.split(';')[0]!.trim().toLowerCase();
  return MIME_EXT[m] ?? null;
}

/** ลบไฟล์ `cms/{subdir}/{entityId}.*` ที่เคยอัปโหลด */
export async function deleteStoredEntityImages(subdir: 'promotions' | 'articles', entityId: string): Promise<void> {
  const dir = join(uploadRootAbs(), 'cms', subdir);
  try {
    const names = await readdir(dir);
    const prefix = `${entityId}.`;
    await Promise.all(
      names
        .filter((n) => n.startsWith(prefix) || n === `${entityId}.tmp`)
        .map(async (n) => {
          try {
            await unlink(join(dir, n));
          } catch {
            /* ignore */
          }
        }),
    );
  } catch {
    /* dir ไม่มี */
  }
}

export async function streamFileToDisk(
  readable: Readable,
  absoluteDestPath: string,
  maxBytes: number,
): Promise<void> {
  await mkdir(dirname(absoluteDestPath), { recursive: true });
  const tmpPath = `${absoluteDestPath}.tmp`;
  const ws = createWriteStream(tmpPath, { flags: 'w' });
  try {
    await pipeline(readable, byteLimitTransform(maxBytes), ws);
    await rename(tmpPath, absoluteDestPath);
  } catch (e) {
    try {
      await unlink(tmpPath);
    } catch {
      /* */
    }
    throw e;
  }
}

export type CmsUploadKind = 'promotion' | 'article';

export async function saveCmsImageFromWebStream(params: {
  kind: CmsUploadKind;
  entityId: string;
  mimeType: string;
  webReadable: ReadableStream<Uint8Array>;
}): Promise<{ relativePath: string; publicUrl: string; absolutePath: string }> {
  const ext = extensionForMime(params.mimeType);
  if (!ext) {
    throw new Error('INVALID_IMAGE_TYPE');
  }
  const subdir = params.kind === 'promotion' ? 'promotions' : 'articles';
  await ensureCmsDirs();
  await deleteStoredEntityImages(subdir, params.entityId);
  const relativePath = `${subdir}/${params.entityId}${ext}`;
  const absolutePath = safeResolveUnderUpload(relativePath);
  const nodeReadable = Readable.fromWeb(params.webReadable as import('stream/web').ReadableStream);
  await streamFileToDisk(nodeReadable, absolutePath, MAX_UPLOAD_IMAGE_BYTES);
  return {
    relativePath,
    publicUrl: publicUrlForCmsFile(relativePath),
    absolutePath,
  };
}

/** ลบรูปตั๋วเดิมบนดิสก์ (ไฟล์เดียวแบบ `{ticketId}.ext` + โฟลเดอร์ย่อยแบบเก่า) */
export async function deleteStoredSupportTicketImages(ticketId: string): Promise<void> {
  const base = join(uploadRootAbs(), 'cms', 'support-tickets');
  try {
    const names = await readdir(base);
    const prefix = `${ticketId}.`;
    await Promise.all(
      names
        .filter((n) => n.startsWith(prefix) || n === `${ticketId}.tmp`)
        .map(async (n) => {
          try {
            await unlink(join(base, n));
          } catch {
            /* */
          }
        }),
    );
  } catch {
    /* */
  }
  const subDir = join(base, ticketId);
  try {
    const inner = await readdir(subDir);
    for (const n of inner) {
      try {
        await unlink(join(subDir, n));
      } catch {
        /* */
      }
    }
    await rmdir(subDir).catch(() => {
      /* */
    });
  } catch {
    /* */
  }
}

/** รูปประกอบตั๋วแจ้งปัญหา — ได้เพียง 1 ไฟล์ต่อตั๋ว (แทนที่รูปเดิม) */
export async function saveSupportTicketSingleImageFromWebStream(params: {
  ticketId: string;
  mimeType: string;
  webReadable: ReadableStream<Uint8Array>;
}): Promise<{ relativePath: string; publicUrl: string; absolutePath: string }> {
  const ext = extensionForMime(params.mimeType);
  if (!ext) {
    throw new Error('INVALID_IMAGE_TYPE');
  }
  await ensureCmsDirs();
  await deleteStoredSupportTicketImages(params.ticketId);
  const relativePath = `support-tickets/${params.ticketId}${ext}`;
  const absolutePath = safeResolveUnderUpload(relativePath);
  const nodeReadable = Readable.fromWeb(params.webReadable as import('stream/web').ReadableStream);
  await streamFileToDisk(nodeReadable, absolutePath, MAX_UPLOAD_IMAGE_BYTES);
  return {
    relativePath,
    publicUrl: publicUrlForCmsFile(relativePath),
    absolutePath,
  };
}

export async function serveCmsFile(relativePathUnderCms: string): Promise<{ path: string; mime: string } | null> {
  const rel = relativePathUnderCms.replace(/^\/+/, '').replace(/\.\./g, '');
  if (!rel || rel.includes('..')) return null;
  const abs = safeResolveUnderUpload(rel);
  try {
    const s = await stat(abs);
    if (!s.isFile()) return null;
  } catch {
    return null;
  }
  const lower = abs.toLowerCase();
  let mime = 'application/octet-stream';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
  else if (lower.endsWith('.png')) mime = 'image/png';
  else if (lower.endsWith('.webp')) mime = 'image/webp';
  else if (lower.endsWith('.gif')) mime = 'image/gif';
  return { path: abs, mime };
}
