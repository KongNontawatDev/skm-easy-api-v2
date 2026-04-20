/**
 * เครื่องมือแอดมิน — ทดสอบส่งข้อความ LINE OA (ข้อความ / Flex) ไปยังลูกค้าตาม legacy customer id
 */
import { env } from '../../core/env/config.js';
import { badRequest, serviceUnavailable } from '../../core/http/errors.js';
import {
  buildFlexNotifyBubble,
  flexNotifyAltText,
  LINE_FLEX_TEMPLATE_KINDS,
  type FlexNotifyContext,
  type LineFlexTemplateKind,
} from '../../integrations/line/flex-templates/flex-notify.templates.js';
import { pushLineFlexMessage, pushLineTextMessage } from '../../integrations/line/line.messaging.js';
import { getLineUserIdForCustomer } from '../legacy-sql/legacy-sql.service.js';

export const LINE_OA_TEST_TEMPLATES = ['TEXT_SIMPLE', ...LINE_FLEX_TEMPLATE_KINDS] as const;

export type LineOaTestTemplate = (typeof LINE_OA_TEST_TEMPLATES)[number];

export function isLineOaTestTemplate(s: string): s is LineOaTestTemplate {
  return (LINE_OA_TEST_TEMPLATES as readonly string[]).includes(s);
}

const TEMPLATE_LABELS_TH: Record<LineOaTestTemplate, string> = {
  TEXT_SIMPLE: 'ข้อความธรรมดา (ทดสอบ)',
  DUE_SOON: 'Flex — ใกล้ถึงกำหนดชำระ',
  DUE_TODAY: 'Flex — ถึงกำหนดชำระวันนี้',
  INVOICE: 'Flex — ใบแจ้งหนี้',
  OVERDUE: 'Flex — เกินกำหนดชำระ',
  RECEIPT: 'Flex — ใบเสร็จ',
  SEVERE_DELINQUENCY: 'Flex — แจ้งเตือนค้างหลายงวด',
  INSTALLMENT_POSTED: 'Flex — ยืนยันตัดงวด',
};

function lineOaChannelLabel(): string {
  const brand = env.LINE_FLEX_BRAND_NAME?.trim() || 'SKM Easy';
  return `LINE OA (${brand})`;
}

export function adminLineOaTestTemplateList(): { id: LineOaTestTemplate; label: string; channel: string }[] {
  const channel = lineOaChannelLabel();
  return LINE_OA_TEST_TEMPLATES.map((id) => ({
    id,
    label: TEMPLATE_LABELS_TH[id],
    channel,
  }));
}

function maskLineUserId(lineUserId: string): string {
  const u = lineUserId.trim();
  if (u.length <= 8) return `${u.slice(0, 2)}…****`;
  return `${u.slice(0, 4)}…${u.slice(-4)}`;
}

function demoFlexContext(kind: LineFlexTemplateKind): FlexNotifyContext {
  const contractRef = 'SKM-DEMO-1199900862730';
  const installmentRef = '12/60';
  const dueDate = '19 เม.ย. 2569';
  const amountBaht = 3520.75;

  switch (kind) {
    case 'DUE_SOON':
      return { contractRef, installmentRef, dueDate, amountBaht };
    case 'DUE_TODAY':
      return { contractRef, installmentRef, amountBaht };
    case 'INVOICE':
      return { contractRef, installmentRef, dueDate, amountBaht };
    case 'OVERDUE':
      return { contractRef, installmentRef, overdueDays: 12, amountBaht };
    case 'RECEIPT':
      return {
        contractRef,
        installmentRef,
        amountBaht,
        receiptId: 'RCP-DEMO-001',
        receiptLines: [
          { label: 'สัญญา', value: contractRef },
          { label: 'งวด', value: installmentRef },
          { label: 'ช่องทาง', value: 'โอน / PromptPay' },
        ],
      };
    case 'SEVERE_DELINQUENCY':
      return {
        contractRef,
        overdueDays: 95,
        overdueInstallmentCount: 4,
        amountBaht: 42000,
      };
    case 'INSTALLMENT_POSTED':
      return {
        contractRef,
        installmentRef,
        status: 'โพสต์งวดสำเร็จ (ทดสอบจากแดชบอร์ด)',
      };
  }
}

export async function adminLineOaTestPush(
  legacyCustomerId: string,
  template: LineOaTestTemplate,
): Promise<{ lineUserIdMasked: string; template: LineOaTestTemplate; channel: string }> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN?.trim()) {
    throw serviceUnavailable('ยังไม่ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ไม่สามารถส่งทดสอบได้');
  }

  const cus = legacyCustomerId.trim();
  const lineUserId = await getLineUserIdForCustomer(cus);
  if (!lineUserId) {
    throw badRequest('ไม่พบ LINE User ID สำหรับลูกค้ารายนี้ (ตรวจสอบการผูก LINE / legacy)');
  }

  const channel = lineOaChannelLabel();

  if (template === 'TEXT_SIMPLE') {
    const text = `ทดสอบข้อความจากแดชบอร์ด

รหัสลูกค้า: ${cus}
ช่อง: LINE Messaging API

ข้อความหลายบรรทัดเพื่อทดสอบการแสดงผล`;
    await pushLineTextMessage(lineUserId, text);
  } else {
    const kind = template as LineFlexTemplateKind;
    const ctx = demoFlexContext(kind);
    const contents = buildFlexNotifyBubble(kind, ctx);
    const altText = flexNotifyAltText(kind, ctx);
    await pushLineFlexMessage(lineUserId, altText, contents);
  }

  return {
    lineUserIdMasked: maskLineUserId(lineUserId),
    template,
    channel,
  };
}
