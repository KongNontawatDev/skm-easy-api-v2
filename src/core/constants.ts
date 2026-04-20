/**
 * ค่าคงที่ runtime — ไม่ต้องตั้งใน .env (ลดความยุ่งของ environment)
 */
export const JWT_ACCESS_TTL_SEC = 900;
export const JWT_REFRESH_TTL_SEC = 60 * 60 * 24 * 7;

export const HTTP_LOG_ENABLED = true;
export const AUDIT_LOG_ENABLED = true;

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 120;
export const ABUSE_BLOCK_THRESHOLD = 300;
export const ABUSE_BLOCK_TTL_SEC = 3600;

export const OTP_BCRYPT_COST = 10;
export const OTP_RATE_LIMIT_MAX = 5;
export const OTP_RATE_LIMIT_WINDOW_SEC = 900;
export const OTP_VERIFY_MAX_ATTEMPTS = 10;
export const OTP_VERIFY_LOCK_WINDOW_SEC = 900;

export const UPLOAD_ROOT = 'data/uploads';
export const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024;

/** ชื่อแบรนด์ใน Flex / ทดสอบ LINE OA */
export const LINE_FLEX_BRAND_NAME = 'SKM Easy';
