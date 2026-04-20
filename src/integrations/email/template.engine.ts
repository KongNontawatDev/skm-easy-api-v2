/**
 * 📌 อธิบายไฟล์นี้:
 * - ไฟล์นี้ทำหน้าที่อะไร: โหลดไฟล์ template `.hbs` แล้ว compile ด้วย Handlebars พร้อม cache ในหน่วยความจำ
 * - ใช้ในส่วนไหนของระบบ: สร้าง HTML อีเมล (OTP, แจ้งเตือนออเดอร์ ฯลฯ)
 * - ทำงานร่วมกับไฟล์อะไรบ้าง: โฟลเดอร์ `integrations/email/templates/*.hbs`
 */
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templatesRoot = join(here, 'templates');

const cache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * 📌 ฟังก์ชันนี้ทำอะไร:
 * - รับ input อะไร: `name` ชื่อไฟล์ template (ไม่รวม .hbs), `data` object สำหรับแทนค่าใน template
 * - ทำงานยังไง: อ่านไฟล์ครั้งแรกแล้ว compile เก็บใน `Map` — ครั้งถัดไปใช้ของ cache
 * - return อะไร: สตริง HTML ที่เรนเดอร์แล้ว
 */
export async function renderEmailTemplate<T extends Record<string, unknown>>(
  name: string,
  data: T,
): Promise<string> {
  if (!cache.has(name)) {
    const source = await readFile(join(templatesRoot, `${name}.hbs`), 'utf8');
    cache.set(name, Handlebars.compile(source));
  }
  const tpl = cache.get(name)!;
  return tpl(data);
}
