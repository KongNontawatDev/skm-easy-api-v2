/**
 * 📌 รูปแบบ response JSON มาตรฐาน (success / error) ให้ client ใช้โครงสร้างเดียวกัน
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Hook } from '@hono/zod-openapi';
import { z, type ZodError } from 'zod';
import type { AppError } from './errors.js';

export type ApiMeta = Record<string, unknown>;

/** รวม meta มาตรฐาน (เช่น correlation / เวลา) กับ meta จาก handler — ให้ key `meta` มีค่าเสมอใน JSON */
export function buildResponseMeta(c: Context, extra?: ApiMeta): ApiMeta {
  const base: ApiMeta = {
    timestamp: new Date().toISOString(),
  };
  const requestId = c.get('requestId');
  if (requestId) base.request_id = requestId;
  if (extra === undefined) return base;
  return { ...base, ...extra };
}

export type ApiClientError = {
  code: string;
  message: string;
  field?: string;
  details?: string[];
};

function defaultSuccessMessage(status: number): string {
  switch (status) {
    case 201:
      return 'สร้างข้อมูลสำเร็จ';
    case 202:
      return 'รับคำขอแล้ว';
    case 204:
      return 'สำเร็จ';
    default:
      return 'สำเร็จ';
  }
}

export function normalizeDetails(details: unknown): string[] | undefined {
  if (details === undefined || details === null) return undefined;
  if (Array.isArray(details)) {
    const out = details.map((d) => (typeof d === 'string' ? d : JSON.stringify(d)));
    return out.length ? out : undefined;
  }
  if (typeof details === 'string') return [details];
  return [JSON.stringify(details)];
}

export function jsonSuccess<T>(
  c: Context,
  data: T,
  opts?: { message?: string; meta?: ApiMeta; status?: ContentfulStatusCode },
) {
  const status = opts?.status ?? 200;
  const message = opts?.message ?? defaultSuccessMessage(status);
  const meta = buildResponseMeta(c, opts?.meta);
  /** cast: OpenAPI route คาด `TypedResponse` status แคบ — ค่า runtime ถูกต้องจาก opts.status */
  return c.json({ success: true as const, data, message, meta }, status) as never;
}

/** สร้าง payload ของ `error` สำหรับ client (ไม่รวม success wrapper) */
export function clientErrorFromAppError(err: AppError): ApiClientError {
  const code = err.code ?? statusToDefaultCode(err.status);
  const details = normalizeDetails(err.details);
  const out: ApiClientError = { code, message: err.message };
  if (err.field) out.field = err.field;
  if (details?.length) out.details = details;
  return out;
}

function statusToDefaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMIT';
    case 500:
      return 'INTERNAL_ERROR';
    default:
      return 'ERROR';
  }
}

export function jsonFailure(c: Context, error: ApiClientError, status: ContentfulStatusCode) {
  const meta = buildResponseMeta(c);
  return c.json({ success: false as const, error, meta }, status) as never;
}

export function jsonFailureFromZod(
  c: Context,
  zodError: ZodError,
  status: ContentfulStatusCode = 422,
) {
  const { message, field, details } = formatZodError(zodError);
  return jsonFailure(
    c,
    {
      code: 'VALIDATION_ERROR',
      message,
      ...(field ? { field } : {}),
      details,
    },
    status,
  );
}

function formatZodError(zodError: ZodError): { message: string; field?: string; details: string[] } {
  const issues = zodError.issues;
  const details = issues.map((i) => {
    const p = i.path.length ? i.path.map(String).join('.') : '';
    return p ? `${p}: ${i.message}` : i.message;
  });
  const first = issues[0];
  const field =
    first?.path.length && typeof first.path[0] === 'string' ? (first.path[0] as string) : undefined;
  const message = first?.message ?? 'ข้อมูลไม่ถูกต้อง';
  return { message, field, details };
}

/** defaultHook ของ OpenAPIHono — validation ไม่ผ่าน → 422 + โครงสร้าง error มาตรฐาน */
export const openApiValidationHook: Hook<any, any, any, any> = (result, c) => {
  if (!result.success) {
    return jsonFailureFromZod(c, result.error, 422);
  }
  return;
};

export const apiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  details: z.array(z.string()).optional(),
});

export const apiFailureEnvelopeSchema = z.object({
  success: z.literal(false),
  error: apiErrorBodySchema,
  meta: z.record(z.string(), z.unknown()),
});

export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string(),
    meta: z.record(z.string(), z.unknown()),
  });
}

/** ใช้ใน OpenAPI `responses` สำหรับ JSON ที่ห่อด้วย envelope */
export function openapiJsonSuccess(dataSchema: z.ZodTypeAny, description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: apiSuccessSchema(dataSchema),
      },
    },
  };
}

const errContent = {
  content: {
    'application/json': {
      schema: apiFailureEnvelopeSchema,
    },
  },
} as const;

/**
 * รหัสข้อผิดพลาดที่ client พบได้บ่อย — ผสานใน `responses` ของแต่ละ route
 * (ไม่รวม 200 เพราะแต่ละ route กำหนด 200 success เอง — กันทับ key ใน object)
 */
export const openapiStandardErrors = {
  400: { description: 'คำขอไม่ถูกต้อง', ...errContent },
  401: { description: 'ไม่ได้รับอนุญาต', ...errContent },
  403: { description: 'สิทธิ์ไม่เพียงพอ', ...errContent },
  404: { description: 'ไม่พบทรัพยากร', ...errContent },
  409: { description: 'ขัดแย้งกับสถานะปัจจุบัน', ...errContent },
  422: { description: 'ตรวจสอบข้อมูลไม่ผ่าน', ...errContent },
  429: { description: 'จำกัดอัตราคำขอ', ...errContent },
  500: { description: 'ข้อผิดพลาดภายในระบบ', ...errContent },
} as const;
