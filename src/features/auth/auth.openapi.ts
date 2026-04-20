/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ประกาศ route ของ feature Auth แบบ OpenAPI + Zod และผูกกับ `authService`
 * - ใช้ในส่วนไหนของระบบ: ลงทะเบียนใน `public.router.ts` (ไม่ต้อง JWT สำหรับ register/login/otp)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `auth.service.ts`
 *
 * 🧭 หมายเหตุสถาปัตยกรรม: ไฟล์นี้ควรมีแค่การ parse/validate + เรียก service + map response — ห้ามใส่ SQL/Prisma โดยตรง
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authService } from './auth.service.js';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';

const authUserSchema = z.object({ id: z.string(), email: z.string().email() });
const tokensUserSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authUserSchema,
});

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `OpenAPIHono` ของ public API
 * - ทำงานยังไง: สร้าง `createRoute` หลายตัวแล้ว `api.openapi(...)` ผูก handler
 * - return อะไร: void (side-effect บน router)
 */
export function registerAuthRoutes(api: OpenAPIHono) {
  const register = createRoute({
    method: 'post',
    path: '/auth/register',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              password: z.string().min(8).max(128),
              name: z.string().min(1).max(120).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: openapiJsonSuccess(tokensUserSchema, 'สร้างบัญชีสำเร็จ'),
      ...openapiStandardErrors,
    },
  });

  const login = createRoute({
    method: 'post',
    path: '/auth/login',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              password: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(tokensUserSchema, 'เข้าสู่ระบบสำเร็จ'),
      ...openapiStandardErrors,
    },
  });

  const refresh = createRoute({
    method: 'post',
    path: '/auth/refresh',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ refreshToken: z.string().min(10) }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(z.object({ accessToken: z.string() }), 'ต่ออายุโทเคนสำเร็จ'),
      ...openapiStandardErrors,
    },
  });

  const otpRequest = createRoute({
    method: 'post',
    path: '/auth/otp/request',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              purpose: z.enum(['login', 'verify_email']),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(z.object({ sent: z.boolean() }), 'ส่ง OTP แล้ว'),
      ...openapiStandardErrors,
    },
  });

  const otpVerify = createRoute({
    method: 'post',
    path: '/auth/otp/verify',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              email: z.string().email(),
              code: z.string().length(4).regex(/^\d{4}$/, 'รหัส OTP ต้องเป็นตัวเลข 4 หลัก'),
              purpose: z.enum(['login', 'verify_email']),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(tokensUserSchema, 'ยืนยัน OTP สำเร็จ'),
      ...openapiStandardErrors,
    },
  });

  const lineCallback = createRoute({
    method: 'post',
    path: '/auth/line/callback',
    tags: ['Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              code: z.string().min(5),
              state: z.string().min(4).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(tokensUserSchema, 'เข้าสู่ระบบด้วย LINE สำเร็จ'),
      ...openapiStandardErrors,
    },
  });

  api.openapi(register, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.register(body);
    return jsonSuccess(c, res, { status: 201, message: 'สร้างบัญชีสำเร็จ' });
  });
  api.openapi(login, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.login(body);
    return jsonSuccess(c, res, { message: 'เข้าสู่ระบบสำเร็จ' });
  });
  api.openapi(refresh, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.refresh(body.refreshToken);
    return jsonSuccess(c, res, { message: 'ต่ออายุโทเคนสำเร็จ' });
  });
  api.openapi(otpRequest, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.requestOtp(body);
    return jsonSuccess(c, res, { message: 'ส่ง OTP แล้ว' });
  });
  api.openapi(otpVerify, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.verifyOtp(body);
    return jsonSuccess(c, res, { message: 'ยืนยัน OTP สำเร็จ' });
  });
  api.openapi(lineCallback, async (c) => {
    const body = c.req.valid('json');
    const res = await authService.lineOAuthCallback(body.code);
    return jsonSuccess(c, res, { message: 'เข้าสู่ระบบด้วย LINE สำเร็จ' });
  });
}
