/**
 * Admin API — `/api/v1/admin` (Better Auth session + staff)
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { openApiValidationHook, jsonFailure } from '../core/http/api-response.js';
import { swaggerUI } from '@hono/swagger-ui';
import { adminBetterAuthMiddleware } from '../core/security/admin-auth.middleware.js';
import { rateLimitMiddleware } from '../core/security/rate-limit.middleware.js';
import { registerAdminRoutes } from '../features/admin/admin.openapi.js';

export function buildAdminApiRouter() {
  const api = new OpenAPIHono({ defaultHook: openApiValidationHook });
  api.use('*', rateLimitMiddleware({ max: 300 }));
  api.use('*', adminBetterAuthMiddleware);
  registerAdminRoutes(api);
  api.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { version: '1.0.0', title: 'SKM Easy Admin API' },
  });
  api.get('/docs', swaggerUI({ url: '/api/v1/admin/openapi.json' }));
  api.notFound((c) => jsonFailure(c, { code: 'NOT_FOUND', message: 'ไม่พบเส้นทาง API' }, 404));
  return api;
}
