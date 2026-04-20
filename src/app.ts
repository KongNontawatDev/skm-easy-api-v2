/**
 * แอป Hono หลัก — Helmet, CORS, request id, log, `/health`, `/api/v1/*`
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { env } from './core/env/config.js';
import { logger } from './core/logger/logger.js';
import { isAppError } from './core/http/errors.js';
import { clientErrorFromAppError, jsonFailure } from './core/http/api-response.js';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { helmetMiddleware } from './core/security/helmet.middleware.js';
import { buildV1Router, healthRouter } from './router/index.js';
import { resolveCorsOrigin } from './core/http/cors-resolve-origin.js';

const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

export function createApp() {
  const app = new Hono();
  app.use('*', helmetMiddleware);
  app.use(
    '*',
    cors({
      origin: (origin) => resolveCorsOrigin(origin, origins),
      allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      exposeHeaders: ['Set-Cookie'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  );

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    const started = performance.now();
    await next();
    const ms = performance.now() - started;
    if (env.HTTP_LOG_ENABLED) {
      logger.info('http', {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(ms),
      });
    }
  });

  app.route('/health', healthRouter);
  app.route('/api/v1', buildV1Router());

  app.onError((err, c) => {
    const requestId = c.get('requestId');
    if (isAppError(err)) {
      logger.warn('app_error', { requestId, message: err.message, code: err.code });
      return jsonFailure(c, clientErrorFromAppError(err), err.status as ContentfulStatusCode);
    }
    logger.error('unhandled_error', { requestId, message: (err as Error).message, stack: (err as Error).stack });
    return jsonFailure(
      c,
      { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' },
      500,
    );
  });

  return app;
}
