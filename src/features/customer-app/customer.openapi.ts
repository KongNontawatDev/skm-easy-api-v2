/**
 * 📌 ไฟล์นี้ทำหน้าที่อะไร
 * - ลงทะเบียน route OpenAPI ลูกค้าแอป: OTP, สัญญา/งวด (legacy), ผูก LINE
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonSuccess, openapiJsonSuccess, openapiStandardErrors } from '../../core/http/api-response.js';
import { badRequest } from '../../core/http/errors.js';
import {
  customerAuthService,
  resolveLegacyCustomerIdForCustomerSession,
} from '../customer-auth/customer-auth.service.js';
import {
  bumpCustomerLegacyCache,
  getContractDetailForCustomer,
  listContractsForCustomerCached,
  listInstallmentsForCustomerCached,
  listReceiptsForCustomerCached,
} from './customer-legacy-cached.service.js';
import { findCustomerByPhone, linkLineProfile } from '../legacy-sql/legacy-sql.service.js';
import {
  bootstrapByLineUserId,
  findLatestCustomerLiffLink,
  patchCustomerLiffLinkProfile,
  resolveLineUserIdFromBootstrapBody,
  unlinkLineForCustomer,
} from '../customer-auth/customer-liff.service.js';

const legacyRow = z.record(z.string(), z.unknown());

const liffBootstrapBody = z.object({
  idToken: z.string().min(10, 'ต้องส่ง id_token จาก LIFF'),
});

/** Route สาธารณะ: OTP ลูกค้า */
export function registerCustomerPublicRoutes(api: OpenAPIHono) {
  const liffBootstrap = createRoute({
    method: 'post',
    path: '/auth/customer/liff/bootstrap',
    tags: ['Customer Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: liffBootstrapBody,
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.any(), 'LIFF bootstrap'), ...openapiStandardErrors },
  });
  api.openapi(liffBootstrap, async (c) => {
    const body = c.req.valid('json');
    const lineUserId = await resolveLineUserIdFromBootstrapBody(body);
    const out = await bootstrapByLineUserId(lineUserId);
    return jsonSuccess(c, out, { message: 'ตรวจสอบ LINE แล้ว' });
  });

  const customerRefresh = createRoute({
    method: 'post',
    path: '/auth/customer/refresh',
    tags: ['Customer Auth'],
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
      200: openapiJsonSuccess(z.object({ accessToken: z.string() }), 'ต่ออายุ access'),
      ...openapiStandardErrors,
    },
  });
  api.openapi(customerRefresh, async (c) => {
    const body = c.req.valid('json');
    const res = await customerAuthService.refreshWithCustomerRefreshToken(body.refreshToken);
    return jsonSuccess(c, res, { message: 'ต่ออายุโทเคนแล้ว' });
  });

  const otpReq = createRoute({
    method: 'post',
    path: '/auth/customer/otp/request',
    tags: ['Customer Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              phone: z
                .string()
                .min(9)
                .max(20)
                .describe('เบอร์มือถือไทย 10 หลักขึ้นต้น 0 หรือรูปแบบ +66 / 668…'),
              nationalId: z
                .string()
                .min(13)
                .max(20)
                .optional()
                .describe('เลขบัตรประชาชน 13 หลัก — แนะนำส่งเพื่อตรวจก่อนส่ง OTP'),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(
        z.object({ sent: z.boolean(), refCode: z.string(), expiresAt: z.string() }),
        'ส่ง OTP',
      ),
      ...openapiStandardErrors,
    },
  });
  api.openapi(otpReq, async (c) => {
    const body = c.req.valid('json');
    const res = await customerAuthService.requestOtp(body.phone, body.nationalId);
    return jsonSuccess(c, res, { message: 'ส่ง OTP แล้ว' });
  });

  const otpVerify = createRoute({
    method: 'post',
    path: '/auth/customer/otp/verify',
    tags: ['Customer Auth'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              phone: z.string().min(9).max(20),
              refCode: z.string().min(4),
              otpCode: z.string().length(4).regex(/^\d{4}$/, 'otpCode ต้องเป็นตัวเลข 4 หลัก'),
              nationalId: z.string().min(13).max(20),
              idToken: z.string().min(10, 'ต้องส่ง id_token จาก LIFF'),
              lineUserName: z.string().max(255).optional(),
              lineUserProfile: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: openapiJsonSuccess(
        z.object({
          accessToken: z.string(),
          refreshToken: z.string(),
          customer: z.object({ legacyCustomerId: z.string(), phone: z.string() }),
        }),
        'ล็อกอินลูกค้า',
      ),
      ...openapiStandardErrors,
    },
  });
  api.openapi(otpVerify, async (c) => {
    const body = c.req.valid('json');
    const res = await customerAuthService.verifyOtp(body);
    return jsonSuccess(c, res, { message: 'ยืนยัน OTP สำเร็จ' });
  });
}

/** Route ใต้ JWT ลูกค้า (role customer) — mount หลัง authMiddleware + เฉพาะ role customer */
export function registerCustomerPrivateRoutes(api: OpenAPIHono) {
  const profile = createRoute({
    method: 'get',
    path: '/me/profile',
    tags: ['Customer'],
    responses: { 200: openapiJsonSuccess(legacyRow, 'โปรไฟล์'), ...openapiStandardErrors },
  });
  api.openapi(profile, async (c) => {
    const auth = c.get('auth')!;
    const phone = auth.customerPhone;
    if (!phone) throw badRequest('ไม่พบเบอร์ในโทเคน');
    const row = await findCustomerByPhone(phone);
    const base: Record<string, unknown> = row ?? { legacyCustomerId: auth.id };
    const link = await findLatestCustomerLiffLink(auth.id);
    /** ชื่อ/รูป LINE จาก LIFF — ใช้เป็นค่าหลักเมื่อมี (legacy มักว่างหรือเป็น '') */
    if (link?.lineDisplayName?.trim()) {
      const n = link.lineDisplayName.trim();
      base.line_user_name = n;
      base.lineUserName = n;
      base.line_display_name = n;
    }
    if (link?.linePictureUrl?.trim()) {
      const u = link.linePictureUrl.trim();
      base.line_user_profile = u;
      base.lineUserProfile = u;
      base.line_picture_url = u;
    }
    return jsonSuccess(c, base, { message: 'โหลดโปรไฟล์' });
  });

  const contracts = createRoute({
    method: 'get',
    path: '/me/contracts',
    tags: ['Customer'],
    responses: { 200: openapiJsonSuccess(z.array(legacyRow), 'สัญญา'), ...openapiStandardErrors },
  });
  api.openapi(contracts, async (c) => {
    const auth = c.get('auth')!;
    const legacyCustomerId = await resolveLegacyCustomerIdForCustomerSession(auth);
    const rows = await listContractsForCustomerCached(legacyCustomerId);
    return jsonSuccess(c, rows, { message: 'รายการสัญญา' });
  });

  const contractDetail = createRoute({
    method: 'get',
    path: '/me/contracts/{contractRef}',
    tags: ['Customer'],
    request: { params: z.object({ contractRef: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(legacyRow, 'รายละเอียดสัญญา'), ...openapiStandardErrors },
  });
  api.openapi(contractDetail, async (c) => {
    const auth = c.get('auth')!;
    const { contractRef } = c.req.valid('param');
    const legacyCustomerId = await resolveLegacyCustomerIdForCustomerSession(auth);
    const row = await getContractDetailForCustomer(legacyCustomerId, contractRef);
    return jsonSuccess(c, row ?? {}, { message: 'รายละเอียดสัญญา' });
  });

  const installments = createRoute({
    method: 'get',
    path: '/me/contracts/{contractRef}/installments',
    tags: ['Customer'],
    request: { params: z.object({ contractRef: z.string().min(1) }) },
    responses: { 200: openapiJsonSuccess(z.array(legacyRow), 'งวดผ่อน'), ...openapiStandardErrors },
  });
  api.openapi(installments, async (c) => {
    const auth = c.get('auth')!;
    const { contractRef } = c.req.valid('param');
    const legacyCustomerId = await resolveLegacyCustomerIdForCustomerSession(auth);
    const rows = await listInstallmentsForCustomerCached(legacyCustomerId, contractRef);
    return jsonSuccess(c, rows, { message: 'รายการงวด' });
  });

  const receipts = createRoute({
    method: 'get',
    path: '/me/receipts',
    tags: ['Customer'],
    responses: { 200: openapiJsonSuccess(z.array(legacyRow), 'ใบเสร็จ'), ...openapiStandardErrors },
  });
  api.openapi(receipts, async (c) => {
    const auth = c.get('auth')!;
    const legacyCustomerId = await resolveLegacyCustomerIdForCustomerSession(auth);
    const rows = await listReceiptsForCustomerCached(legacyCustomerId);
    return jsonSuccess(c, rows, { message: 'ใบเสร็จ' });
  });

  const lineLink = createRoute({
    method: 'post',
    path: '/me/line/link',
    tags: ['Customer'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              lineUserId: z.string().min(4).max(255),
              lineUserName: z.string().max(255).optional(),
              lineUserProfile: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.object({ linked: z.boolean() }), 'ผูก LINE'), ...openapiStandardErrors },
  });
  api.openapi(lineLink, async (c) => {
    const auth = c.get('auth')!;
    const body = c.req.valid('json');
    const lineUserName = body.lineUserName?.trim();
    const lineUserProfile = body.lineUserProfile?.trim();
    await linkLineProfile({
      lineUserId: body.lineUserId,
      lineUserName: lineUserName ?? '',
      lineProfile: lineUserProfile ?? '',
      legacyCustomerId: auth.id,
    });
    const linkData: { lineDisplayName?: string | null; linePictureUrl?: string | null } = {};
    if (lineUserName) linkData.lineDisplayName = lineUserName;
    if (lineUserProfile) linkData.linePictureUrl = lineUserProfile;
    if (Object.keys(linkData).length > 0) {
      await patchCustomerLiffLinkProfile(auth.id, body.lineUserId, linkData);
    }
    await bumpCustomerLegacyCache(auth.id);
    return jsonSuccess(c, { linked: true }, { message: 'ผูก LINE สำเร็จ' });
  });

  const lineUnlink = createRoute({
    method: 'post',
    path: '/me/line/unlink',
    tags: ['Customer'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: liffBootstrapBody,
          },
        },
      },
    },
    responses: { 200: openapiJsonSuccess(z.object({ ok: z.boolean() }), 'ยกเลิกการเชื่อมต่อ'), ...openapiStandardErrors },
  });
  api.openapi(lineUnlink, async (c) => {
    const auth = c.get('auth')!;
    const body = c.req.valid('json');
    const lineUserId = await resolveLineUserIdFromBootstrapBody(body);
    await unlinkLineForCustomer(auth.id, lineUserId);
    await bumpCustomerLegacyCache(auth.id);
    return jsonSuccess(c, { ok: true }, { message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' });
  });
}
