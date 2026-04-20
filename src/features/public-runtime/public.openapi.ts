/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: route สาธารณะสำหรับค่าคอนฟิก runtime ที่ frontend ใช้ตั้งค่าเริ่มต้น (เช่น default payment provider)
 * - ใช้ในส่วนไหนของระบบ: `public.router.ts` ไม่ต้อง JWT
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `public-config.service.ts`
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { publicConfigService } from './public-config.service.js';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';

const runtimeDataSchema = z.object({
  currency: z.string(),
  app: z.object({ kind: z.string(), paymentVerification: z.string() }),
});

/** 📌 ลงทะเบียน `/public/runtime-config` */
export function registerPublicRuntimeRoutes(api: OpenAPIHono) {
  const runtime = createRoute({
    method: 'get',
    path: '/public/runtime-config',
    tags: ['Public'],
    responses: {
      200: openapiJsonSuccess(runtimeDataSchema, 'ค่าคอนฟิก runtime'),
      ...openapiStandardErrors,
    },
  });

  api.openapi(runtime, async (c) => {
    const cfg = publicConfigService.get();
    return jsonSuccess(c, cfg, { message: 'ดึงค่าคอนฟิก runtime สำเร็จ' });
  });
}
