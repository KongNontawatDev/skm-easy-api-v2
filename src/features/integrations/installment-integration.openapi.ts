/**
 * API สำหรับระบบตัดงวด (ภายนอก) — POST พร้อม `cus_id` + `status` → แจ้งลูกค้า LINE OA + in-app
 * ไม่ใช้ล็อกอิน — ยืนยันด้วย API key ถาวรใน header `X-Api-Key` (หรือ Bearer / secret แบบเดิม)
 */
import { timingSafeEqual } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { env } from '../../core/env/config.js';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import { serviceUnavailable, unauthorized } from '../../core/http/errors.js';
import { redis } from '../../core/security/redis.client.js';
import {
  installmentNotifyPayloadSchema,
  notifyCustomerAfterInstallmentPosting,
  payloadToNotifyInput,
} from './installment-posting-notify.service.js';

function secureCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function configuredPostingApiKey(): string | undefined {
  return env.INSTALLMENT_POSTING_API_KEY?.trim() || env.INSTALLMENT_INTEGRATION_SECRET?.trim();
}

/** รับคีย์จาก X-Api-Key (แนะนำ), Bearer, หรือ X-Installment-Integration-Secret */
const requireInstallmentPostingApiKey: MiddlewareHandler = async (c, next) => {
  const secret = configuredPostingApiKey();
  if (!secret) {
    throw serviceUnavailable('ยังไม่ตั้งค่า INSTALLMENT_POSTING_API_KEY (หรือ INSTALLMENT_INTEGRATION_SECRET)');
  }
  const apiKey =
    c.req.header('X-Api-Key')?.trim() ||
    c.req.header('x-api-key')?.trim() ||
    (() => {
      const auth = c.req.header('Authorization') ?? '';
      return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    })() ||
    c.req.header('X-Installment-Integration-Secret')?.trim() ||
    '';
  if (!apiKey || !secureCompare(apiKey, secret)) {
    throw unauthorized(
      'ไม่ได้รับอนุญาต — ตั้งค่า INSTALLMENT_POSTING_API_KEY แล้วส่งค่าเดียวกันใน header X-Api-Key',
    );
  }
  await next();
};

export function registerInstallmentIntegrationRoutes(api: OpenAPIHono) {
  const notify = createRoute({
    method: 'post',
    path: '/integrations/installment-notify',
    tags: ['Integration — Installment posting'],
    description:
      'ระบบตัดงวดภายนอกเรียกหลังตัดงวดเสร็จ — ส่ง JSON `{ "cus_id": "...", "status": "..." }` และ header `X-Api-Key` ตรงกับ `INSTALLMENT_POSTING_API_KEY` ใน env',
    request: {
      body: {
        content: {
          'application/json': {
            schema: installmentNotifyPayloadSchema,
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(
        z.object({
          lineEnqueued: z.boolean(),
          inAppCreated: z.boolean(),
          duplicate: z.boolean().optional(),
        }),
        'แจ้งเตือนแล้ว',
      ),
      ...openapiStandardErrors,
    },
  });

  api.use('/integrations/installment-notify', requireInstallmentPostingApiKey);
  api.openapi(notify, async (c) => {
    const body = c.req.valid('json');
    if (body.requestId) {
      const dedupeKey = `integration:installment-notify:${body.requestId}`;
      const set = await redis.set(dedupeKey, '1', 'EX', 600, 'NX');
      if (set === null) {
        return jsonSuccess(
          c,
          { lineEnqueued: false, inAppCreated: false, duplicate: true },
          { message: 'รับคำขอซ้ำ (requestId เดิมภายใน 10 นาที)' },
        );
      }
    }
    const result = await notifyCustomerAfterInstallmentPosting(payloadToNotifyInput(body));
    return jsonSuccess(c, result, { message: 'แจ้งเตือนลูกค้าแล้ว' });
  });
}
