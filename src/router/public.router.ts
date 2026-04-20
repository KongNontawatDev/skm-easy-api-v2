/**
 * Public API (`/api/v1/...`) — ลูกค้าแอป, CMS, auth, integration
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { rateLimitMiddleware } from '../core/security/rate-limit.middleware.js';
import { authMiddleware, requireCustomer } from '../core/security/auth.middleware.js';
import { registerAuthRoutes } from '../features/auth/auth.openapi.js';
import { registerUserRoutes } from '../features/users/users.openapi.js';
import { registerNotificationRoutes } from '../features/notifications/notifications.openapi.js';
import { registerPublicRuntimeRoutes } from '../features/public-runtime/public.openapi.js';
import {
  registerCustomerPrivateRoutes,
  registerCustomerPublicRoutes,
} from '../features/customer-app/customer.openapi.js';
import { registerPublicCmsRoutes } from '../features/cms/cms.openapi.js';
import { registerCustomerSupportRoutes } from '../features/support-app/support.openapi.js';
import { registerCustomerSupportUploadRoutes } from '../features/support-app/support-upload.routes.js';
import { registerInstallmentIntegrationRoutes } from '../features/integrations/installment-integration.openapi.js';
import { openApiValidationHook, jsonFailure } from '../core/http/api-response.js';

export function buildPublicApiRouter() {
  const api = new OpenAPIHono({ defaultHook: openApiValidationHook });
  api.use('*', rateLimitMiddleware());
  registerAuthRoutes(api);
  registerCustomerPublicRoutes(api);
  registerPublicRuntimeRoutes(api);
  registerPublicCmsRoutes(api);
  registerInstallmentIntegrationRoutes(api);

  api.use('/me/*', authMiddleware, requireCustomer);
  registerCustomerPrivateRoutes(api);
  registerCustomerSupportRoutes(api);
  registerCustomerSupportUploadRoutes(api);

  api.use('/notifications/*', authMiddleware);
  api.use('/notifications', authMiddleware);
  api.use('/users/*', authMiddleware);
  registerNotificationRoutes(api);
  registerUserRoutes(api);

  api.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { version: '1.0.0', title: 'SKM Easy — Installment Platform API' },
  });
  api.get('/docs', swaggerUI({ url: '/api/v1/openapi.json' }));

  api.notFound((c) => jsonFailure(c, { code: 'NOT_FOUND', message: 'ไม่พบเส้นทาง API' }, 404));
  return api;
}
