/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: นิยาม error มาตรฐานของแอป (`AppError`) และ factory สั้น ๆ สำหรับ HTTP status ที่ใช้บ่อย
 * - ใช้ในส่วนไหนของระบบ: ทุก feature/service ที่ต้องการส่งข้อความปลอดภัยให้ client พร้อมรหัส `code`
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `app.ts` (`isAppError` ใน onError), controller/service ทั่วทั้งโค้ด
 */
/**
 * 📌 คลาสนี้ทำอะไร:
 * - รับ input อะไร: `status` (HTTP), `message` (ข้อความที่แสดงได้), `code` (รหัสธุรกิจ), `details` (ข้อมูลเสริมที่ไม่ sensitive)
 * - ทำงานยังไง: สืบทอด `Error` เพื่อให้ `instanceof` ใช้แยกใน error handler กลาง
 * - return อะไร: instance ที่ throw ได้ด้วย `throw new AppError(...)`
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
    /** ชื่อฟิลด์สำหรับ client highlight (เช่น validation) */
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 📌 สร้าง error 404 พร้อมข้อความกำหนดได้ — input: ข้อความ; return: AppError */
export const notFound = (msg = 'ไม่พบทรัพยากร') => new AppError(404, msg, 'NOT_FOUND');
/** 📌 400 — input ไม่ถูกต้อง (รูปแบบคำขอ, พารามิเตอร์ขาด ฯลฯ) */
export const badRequest = (msg: string, details?: unknown, field?: string) =>
  new AppError(400, msg, 'BAD_REQUEST', details, field);

/** 📌 422 — validate ตามสคีมาไม่ผ่าน (REST) */
export const unprocessableEntity = (msg: string, details?: unknown, field?: string) =>
  new AppError(422, msg, 'VALIDATION_ERROR', details, field);
/** 📌 401 — ไม่มีหรือโทเคน JWT ไม่ถูกต้อง */
export const unauthorized = (msg = 'ไม่ได้รับอนุญาต') => new AppError(401, msg, 'UNAUTHORIZED');
/** 📌 403 — ล็อกอินแล้วแต่สิทธิ์ไม่พอ */
export const forbidden = (msg = 'สิทธิ์ไม่เพียงพอ') => new AppError(403, msg, 'FORBIDDEN');
/** 📌 409 — state ชนกัน (เช่น idempotency หรือทรัพยากรซ้ำ) */
export const conflict = (msg: string) => new AppError(409, msg, 'CONFLICT');
/** 📌 429 — ถูก rate limit */
export const tooManyRequests = (msg = 'คำขอมากเกินไป') => new AppError(429, msg, 'RATE_LIMIT');
/** 📌 503 — บริการภายนอกหรือการตั้งค่า legacy ยังไม่พร้อม */
export const serviceUnavailable = (msg = 'บริการไม่พร้อม') =>
  new AppError(503, msg, 'SERVICE_UNAVAILABLE');

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `err` แบบ unknown จาก catch
 * - ทำงานยังไง: type guard ด้วย `instanceof AppError`
 * - return อะไร: boolean และ narrow type เป็น `AppError` เมื่อเป็น true
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
