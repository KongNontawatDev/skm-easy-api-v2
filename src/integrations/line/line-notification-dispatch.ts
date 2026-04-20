/**
 * ส่ง LINE Push จาก payload เดียวกับที่เคยใส่ในคิวแจ้งเตือน — เรียกแบบ sync ใน request
 */
import { logger } from '../../core/logger/logger.js';
import { pushLineFlexMessage, pushLineTextMessage } from './line.messaging.js';

export type NotificationJob =
  | {
      type: 'LINE_TEXT';
      lineUserId: string;
      title: string;
      message: string;
      legacyCustomerId: string;
    }
  | {
      type: 'LINE_FLEX';
      lineUserId: string;
      legacyCustomerId: string;
      altText: string;
      flexContents: Record<string, unknown>;
    }
  | {
      type: 'INSTALLMENT_VERIFIED';
      lineUserId: string;
      title: string;
      message: string;
      legacyCustomerId: string;
    };

export async function dispatchLineNotificationJob(data: NotificationJob): Promise<void> {
  try {
    if (data.type === 'LINE_FLEX') {
      await pushLineFlexMessage(data.lineUserId, data.altText, data.flexContents);
      return;
    }
    if (data.type === 'LINE_TEXT' || data.type === 'INSTALLMENT_VERIFIED') {
      await pushLineTextMessage(data.lineUserId, `${data.title}\n${data.message}`);
      return;
    }
  } catch (e) {
    logger.error('ส่ง LINE ไม่สำเร็จ', {
      legacyCustomerId: data.legacyCustomerId,
      type: data.type,
      message: (e as Error).message,
    });
    throw e;
  }
  logger.warn('notification: ประเภทงานไม่รองรับ', { type: (data as { type?: string }).type });
}
