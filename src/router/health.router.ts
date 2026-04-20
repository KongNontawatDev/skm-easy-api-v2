/**
 * Health check — `/health` และ `/health/deps/{server|database}`
 */
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { HealthReport } from '../core/health/health.service.js';
import { getHealthReport } from '../core/health/health.service.js';
import { buildResponseMeta, jsonSuccess } from '../core/http/api-response.js';

export const healthRouter = new Hono();

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };

const DEP_NAMES = ['server', 'database'] as const satisfies readonly (keyof HealthReport['checks'])[];

function checksSummary(report: HealthReport): string {
  return DEP_NAMES.map((name) => `${name}=${report.checks[name]}`).join(', ');
}

function withSummary(report: HealthReport): HealthReport & { summary: string } {
  return { ...report, summary: checksSummary(report) };
}

function applyPerCheckHeaders(c: Context, report: HealthReport) {
  c.header('X-Health-Overall', report.status);
  for (const name of DEP_NAMES) {
    c.header(`X-Health-${name}`, report.checks[name]);
  }
}

function applyNoStore(c: Context) {
  Object.entries(noStore).forEach(([k, v]) => c.header(k, v));
}

healthRouter.get('/deps/:component', async (c) => {
  const raw = c.req.param('component');
  if (!DEP_NAMES.includes(raw as (typeof DEP_NAMES)[number])) {
    return c.json(
      { success: false as const, message: `ไม่รู้จัก component: ${raw}`, meta: buildResponseMeta(c) },
      404,
      noStore,
    );
  }
  const component = raw as (typeof DEP_NAMES)[number];
  const report = await getHealthReport();
  const partOk = report.checks[component] === 'ok';

  applyNoStore(c);
  applyPerCheckHeaders(c, report);

  const body = {
    component,
    status: report.checks[component],
    overall: report.status,
    checks: report.checks,
    ...(report.error ? { error: report.error } : {}),
  };

  if (partOk) {
    return jsonSuccess(c, body, {
      status: 200,
      message: `${component} พร้อม`,
    });
  }
  return c.json(
    {
      success: false as const,
      data: body,
      message: `${component} ไม่พร้อม`,
      meta: buildResponseMeta(c),
    },
    503,
    noStore,
  );
});

healthRouter.get('/', async (c) => {
  const report = await getHealthReport();
  const ok = report.status === 'ok';
  const payload = withSummary(report);

  applyNoStore(c);
  applyPerCheckHeaders(c, report);

  if (ok) {
    return jsonSuccess(c, payload, {
      status: 200,
      message: 'ระบบพร้อมทำงาน',
    });
  }
  return c.json(
    {
      success: false as const,
      data: payload,
      message: 'ระบบไม่พร้อมทำงาน',
      meta: buildResponseMeta(c),
    },
    503,
    noStore,
  );
});
