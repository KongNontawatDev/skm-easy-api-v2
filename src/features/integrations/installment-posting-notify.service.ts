/**
 * รับผลจากระบบตัดงวด (ภายนอก) แล้วแจ้งลูกค้า — LINE Messaging API (ข้อความ / Flex) + แจ้งเตือนในแอป
 */
import { z } from 'zod';
import { prisma } from '../../core/db/client.js';
import { newDbId } from '../../core/db/new-id.js';
import { badRequest } from '../../core/http/errors.js';
import { logger } from '../../core/logger/logger.js';
import { dispatchLineNotificationJob } from '../../integrations/line/line-notification-dispatch.js';
import { bumpCustomerLegacyCache } from '../customer-app/customer-legacy-cached.service.js';
import { getLineUserIdForCustomer } from '../legacy-sql/legacy-sql.service.js';
import {
  buildFlexNotifyBubble,
  flexNotifyAltText,
  type FlexNotifyContext,
  type LineFlexTemplateKind,
} from '../../integrations/line/flex-templates/flex-notify.templates.js';

const lineFlexKindSchema = z.enum([
  'DUE_SOON',
  'DUE_TODAY',
  'INVOICE',
  'OVERDUE',
  'RECEIPT',
  'SEVERE_DELINQUENCY',
  'INSTALLMENT_POSTED',
]);

export type InstallmentPostingNotifyInput = {
  legacyCustomerId?: string;
  cusId?: string;
  status: string;
  contractRef?: string;
  installmentRef?: string;
  title?: string;
  message?: string;
  pushLine?: boolean;
  inAppNotification?: boolean;
  /** เลือก template Flex — ถ้าไม่ส่งจะเลือกจาก status (ส่วนใหญ่เป็น INSTALLMENT_POSTED) */
  lineFlexKind?: LineFlexTemplateKind;
  /** ฟิลด์เสริมสำหรับ Flex (dueDate, amountBaht, receiptLines, …) */
  flexContext?: Partial<FlexNotifyContext>;
};

function defaultTitle(status: string): string {
  const u = status.toUpperCase();
  if (u === 'FAILED' || u === 'REJECTED' || u === 'ERROR') {
    return 'แจ้งสถานะงวดผ่อน';
  }
  return 'ยืนยันการตัดงวด';
}

function defaultMessage(input: InstallmentPostingNotifyInput): string {
  const parts: string[] = [`สถานะ: ${input.status}`];
  if (input.contractRef) parts.push(`สัญญา: ${input.contractRef}`);
  if (input.installmentRef) parts.push(`งวด: ${input.installmentRef}`);
  return parts.join('\n');
}

/** เมื่อไม่ระบุ lineFlexKind: ใช้ Flex สำหรับผลปกติ, ข้อความล้วนเมื่อล้มเหลว */
function inferFlexKind(status: string): LineFlexTemplateKind | null {
  const u = status.toUpperCase();
  if (['FAILED', 'REJECTED', 'ERROR'].includes(u)) return null;
  if (u === 'OVERDUE' || u === 'LATE') return 'OVERDUE';
  return 'INSTALLMENT_POSTED';
}

export async function notifyCustomerAfterInstallmentPosting(
  input: InstallmentPostingNotifyInput,
): Promise<{ lineEnqueued: boolean; inAppCreated: boolean }> {
  const legacyCustomerId = (input.legacyCustomerId ?? input.cusId)?.trim();
  if (!legacyCustomerId) {
    throw badRequest('ต้องส่ง legacyCustomerId หรือ cusId');
  }

  const title = (input.title?.trim() || defaultTitle(input.status)).slice(0, 200);
  const message = (input.message?.trim() || defaultMessage(input)).slice(0, 4000);

  const pushLine = input.pushLine !== false;
  const inApp = input.inAppNotification !== false;

  let lineEnqueued = false;
  if (pushLine) {
    const lineUserId = await getLineUserIdForCustomer(legacyCustomerId);
    if (lineUserId) {
      const flexKind = input.lineFlexKind ?? inferFlexKind(input.status);
      if (flexKind) {
        const ctx: FlexNotifyContext = {
          contractRef: input.contractRef,
          installmentRef: input.installmentRef,
          status: input.status,
          ...input.flexContext,
        };
        const flexContents = buildFlexNotifyBubble(flexKind, ctx);
        const altText = flexNotifyAltText(flexKind, ctx);
        await dispatchLineNotificationJob({
          type: 'LINE_FLEX',
          lineUserId,
          legacyCustomerId,
          altText,
          flexContents,
        });
      } else {
        await dispatchLineNotificationJob({
          type: 'LINE_TEXT',
          lineUserId,
          title,
          message,
          legacyCustomerId,
        });
      }
      lineEnqueued = true;
    } else {
      logger.warn('installment posting: ไม่พบ line_user_id ข้ามการส่ง LINE', { legacyCustomerId });
    }
  }

  let inAppCreated = false;
  if (inApp) {
    const nid = newDbId();
    const nt = new Date();
    await prisma.$executeRawUnsafe(
      'INSERT INTO `notifications` (`id`,`idno`,`title`,`message`,`type`,`is_read`,`created_at`) VALUES (?,?,?,?,?,?,?)',
      nid,
      legacyCustomerId,
      title,
      message.slice(0, 8000),
      'INSTALLMENT_POSTING',
      false,
      nt,
    );
    await bumpCustomerLegacyCache(legacyCustomerId);
    inAppCreated = true;
  }

  return { lineEnqueued, inAppCreated };
}

/**
 * Body ของ `POST /integrations/installment-notify` — ระบบตัดงวดส่ง `cusId` + `status` (+ ฟิลด์ Flex ถ้ามี)
 */
export const installmentNotifyPayloadSchema = z
  .object({
    legacyCustomerId: z.string().min(1).optional(),
    /** รหัสลูกค้า legacy เช่น `COMPID:IDNO` — ชื่อเดิม */
    cusId: z.string().min(1).optional(),
    /** ชื่อเดียวกับที่ระบบตัดงวดภายนอกมักส่งมา (snake_case) */
    cus_id: z.string().min(1).optional(),
    status: z.string().min(1).max(128),
    contractRef: z.string().max(200).optional(),
    installmentRef: z.string().max(200).optional(),
    title: z.string().max(200).optional(),
    message: z.string().max(4000).optional(),
    pushLine: z.boolean().optional(),
    inAppNotification: z.boolean().optional(),
    lineFlexKind: lineFlexKindSchema.optional(),
    dueDate: z.string().max(64).optional(),
    amountBaht: z.number().optional(),
    overdueDays: z.number().int().optional(),
    overdueInstallmentCount: z.number().int().optional(),
    receiptId: z.string().max(128).optional(),
    invoiceLiffUri: z.string().url().optional(),
    receiptLiffUri: z.string().url().optional(),
    receiptLines: z
      .array(z.object({ label: z.string().max(200), value: z.string().max(500) }))
      .max(20)
      .optional(),
    /** กันซ้ำเมื่อระบบตัดงวด retry — ค่าเดิมภายใน 10 นาทีจะได้ duplicate: true */
    requestId: z.string().min(8).max(200).optional(),
  })
  .refine((o) => Boolean(o.legacyCustomerId?.trim() || o.cusId?.trim() || o.cus_id?.trim()), {
    message: 'ต้องมี cus_id / cusId / legacyCustomerId อย่างใดอย่างหนึ่ง',
    path: ['cus_id'],
  });

export type InstallmentNotifyPayload = z.infer<typeof installmentNotifyPayloadSchema>;

/** @deprecated ใช้ installmentNotifyPayloadSchema */
export const installmentPostingWebhookDataSchema = installmentNotifyPayloadSchema;
/** @deprecated ใช้ InstallmentNotifyPayload */
export type InstallmentPostingWebhookData = InstallmentNotifyPayload;

/** แปลง payload เป็น input ของ notifyCustomerAfterInstallmentPosting */
export function payloadToNotifyInput(data: InstallmentNotifyPayload): InstallmentPostingNotifyInput {
  const {
    dueDate,
    amountBaht,
    overdueDays,
    overdueInstallmentCount,
    receiptId,
    invoiceLiffUri,
    receiptLiffUri,
    receiptLines,
    requestId: _requestId,
    cus_id,
    ...rest
  } = data;
  const cusIdMerged = rest.cusId?.trim() || cus_id?.trim();
  const flexContext: Partial<FlexNotifyContext> = {
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(amountBaht !== undefined ? { amountBaht } : {}),
    ...(overdueDays !== undefined ? { overdueDays } : {}),
    ...(overdueInstallmentCount !== undefined ? { overdueInstallmentCount } : {}),
    ...(receiptId !== undefined ? { receiptId } : {}),
    ...(invoiceLiffUri !== undefined ? { invoiceLiffUri } : {}),
    ...(receiptLiffUri !== undefined ? { receiptLiffUri } : {}),
    ...(receiptLines !== undefined ? { receiptLines } : {}),
  };
  return {
    ...rest,
    ...(cusIdMerged ? { cusId: cusIdMerged } : {}),
    ...(Object.keys(flexContext).length > 0 ? { flexContext } : {}),
  };
}

/** @deprecated ใช้ payloadToNotifyInput */
export const webhookDataToNotifyInput = payloadToNotifyInput;
