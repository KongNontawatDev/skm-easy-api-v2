/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: ส่งข้อความ Push ผ่าน LINE Messaging API (Bot)
 * - ใช้ในส่วนไหนของระบบ: `line-notification-dispatch.ts` และบริการแจ้งเตือนอื่น ๆ
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `LINE_CHANNEL_ACCESS_TOKEN` ใน env
 */
import { env } from '../../core/env/config.js';
import { logger } from '../../core/logger/logger.js';

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `toUserId` คือ LINE user id ของผู้รับ, `text` ข้อความสั้น ๆ
 * - ทำงานยังไง: POST `/v2/bot/message/push` — ถ้าไม่มี token จะข้ามอย่างเงียบ (warn)
 * - return อะไร: Promise<void> หรือ throw เมื่อ HTTP ไม่ ok
 */
export async function pushLineTextMessage(toUserId: string, text: string) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    logger.warn('LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า ข้ามการส่งข้อความ');
    return;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error('LINE push ล้มเหลว', { status: res.status, body });
    throw new Error(`LINE push failed: ${res.status}`);
  }
}

/**
 * ส่ง Flex Message (bubble เดี่ยว) — ดูโครงสร้างที่ `flex-templates/flex-notify.templates.ts`
 * อ้างอิง: https://developers.line.biz/en/docs/messaging-api/using-flex-messages/
 */
export async function pushLineFlexMessage(
  toUserId: string,
  altText: string,
  /** object root ของ bubble (type: "bubble", body, footer, …) */
  contents: Record<string, unknown>,
) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    logger.warn('LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า ข้ามการส่ง Flex');
    return;
  }
  const alt = altText.trim().slice(0, 400);
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [
        {
          type: 'flex',
          altText: alt,
          contents,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error('LINE Flex push ล้มเหลว', { status: res.status, body });
    throw new Error(`LINE Flex push failed: ${res.status}`);
  }
}
