/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: จำกัดจำนวนคำขอต่อ IP+path ใน memory และมีระบบ block เมื่อพฤติกรรมผิดปกติสูงเกินเกณฑ์
 * - ใช้ในส่วนไหนของระบบ: public/admin router ทุกคำขอ
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `redis.client.ts` (in-memory), `env` (threshold/window), `errors.ts` (`tooManyRequests`)
 *
 * 🛡 rate limit คืออะไร (สอนเริ่มต้น):
 * - จำกัดว่า “ภายใน X มิลลิวินาที” แต่ละ IP ต่อ path นี้ ยิงได้ไม่เกิน N ครั้ง
 * - ช่วยกัน bot brute force และลดโหลดเซิร์ฟเวอร์
 */
import type { MiddlewareHandler } from 'hono';
import { env } from '../env/config.js';
import { redis } from './redis.client.js';
import { tooManyRequests } from '../http/errors.js';

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: Hono context ย่อยที่มี `req.header`
 * - ทำงานยังไง: ถ้ามี `X-Forwarded-For` ใช้ IP แรกในลิสต์ (client จริงหลัง proxy)
 * - return อะไร: สตริงคีย์สำหรับ rate limit
 */
function clientKey(c: { req: { header: (n: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return c.req.header('x-real-ip') ?? 'unknown';
}

/**
 * 📌 ฟังก์ชันนี้ทำอะไร (โรงงาน middleware):
 * - รับ input อะไร: `opts.max` / `opts.windowMs` แทนค่า default จาก env
 * - ทำงานยังไง: นับ counter ต่อคีย์ `ratelimit:ip:path` + TTL; ถ้าเกิน max จะนับ abuse และอาจ SET block key
 * - return อะไร: `MiddlewareHandler`
 */
export const rateLimitMiddleware =
  (opts?: { max?: number; windowMs?: number }): MiddlewareHandler =>
  async (c, next) => {
    const max = opts?.max ?? env.RATE_LIMIT_MAX;
    const windowMs = opts?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
    const keyIp = clientKey(c);
    const route = c.req.path;
    const blockKey = `abuse:block:${keyIp}`;
    const blocked = await redis.get(blockKey);
    if (blocked) {
      throw tooManyRequests('ถูกบล็อกชั่วคราวจากพฤติกรรมผิดปกติ');
    }
    // นับจำนวนคำขอต่อ IP+path ในหน้าต่างเวลาเดียวกัน
    const rlKey = `ratelimit:${keyIp}:${route}`;
    const count = await redis.incr(rlKey);
    if (count === 1) {
      await redis.pexpire(rlKey, windowMs);
    }
    if (count > max) {
      const abuseKey = `abuse:count:${keyIp}`;
      const abuse = await redis.incr(abuseKey);
      if (abuse === 1) {
        await redis.expire(abuseKey, Math.ceil(windowMs / 1000));
      }
      if (abuse >= env.ABUSE_BLOCK_THRESHOLD) {
        await redis.set(blockKey, '1', 'EX', env.ABUSE_BLOCK_TTL_SEC);
      }
      throw tooManyRequests();
    }
    await next();
  };
