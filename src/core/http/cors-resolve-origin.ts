/**
 * ค่า `Access-Control-Allow-Origin` สำหรับ `credentials: true`
 * — ห้ามใช้ `*` กับคุกกี้ (เบราว์เซอร์จะบล็อก) ดู [Better Auth + Hono](https://www.better-auth.com/docs/integrations/hono)
 */
import { env } from '../env/config.js';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** dev ผ่าน ngrok / tunnel — ต้อง echo origin จริง (ใช้กับ credentials) */
function isDevTunnelOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith('.ngrok-free.app') ||
      hostname.endsWith('.ngrok.io') ||
      hostname.endsWith('.ngrok.app')
    );
  } catch {
    return false;
  }
}

export function resolveCorsOrigin(origin: string | undefined, originsConfig: string[]): string {
  const list = originsConfig.map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) {
    if (!origin) return '';
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
    } catch {
      return '';
    }
    return '';
  }
  if (!origin) return '';
  if (list.includes(origin)) return origin;
  /** ใน development อนุญาตทุกพอร์ตบน localhost / 127.0.0.1 — ไม่ต้องเติม CORS_ORIGINS ทุกครั้งที่ Vite เลือกพอร์ตใหม่ (เช่น 5174) */
  if (env.NODE_ENV === 'development' && isLocalDevOrigin(origin)) return origin;
  /** dev เปิดแอปผ่าน ngrok แล้วยิง API ที่ localhost — ต้องอนุญาต origin ของ tunnel */
  if (env.NODE_ENV === 'development' && isDevTunnelOrigin(origin)) return origin;
  return '';
}
