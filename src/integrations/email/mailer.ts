/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: สร้าง SMTP transporter (nodemailer) และฟังก์ชันส่งอีเมลทันที
 * - ใช้ในส่วนไหนของระบบ: จุดที่ต้องการส่งอีเมลทันที (เช่น OTP)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: `env` (SMTP_*), `logger`
 */
import nodemailer from 'nodemailer';
import { env } from '../../core/env/config.js';
import { logger } from '../../core/logger/logger.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth:
    env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
});

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
};

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `{ to, subject, html }`
 * - ทำงานยังไง: `sendMail` ผ่าน transporter — error จะ log แล้ว rethrow ให้ caller
 * - return อะไร: Promise<void>
 */
export async function sendMailNow(input: SendMailInput) {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  } catch (e) {
    logger.error('ส่งอีเมลล้มเหลว', { error: (e as Error).message });
    throw e;
  }
}
