import { z } from '@hono/zod-openapi';

/** จำกัดความยาว HTML รวม base64 — สอดคล้องกับคอลัมน์ LONGTEXT และกันพยายามโจมตีขนาดใหญ่เกิน */
export const CMS_HTML_MAX_CHARS = 10 * 1024 * 1024;

export const zCmsHtml = z.string().min(1).max(CMS_HTML_MAX_CHARS);
export const zCmsHtmlOpt = z.string().min(1).max(CMS_HTML_MAX_CHARS).optional();

/** คำอธิบายตั๋วจากแอปลูกค้า */
export const zSupportTicketDescription = z.string().min(5).max(CMS_HTML_MAX_CHARS);
