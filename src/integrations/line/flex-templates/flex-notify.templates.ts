/**
 * Flex Message templates สำหรับแจ้งเตือน LINE OA (งวดผ่อน / ใบแจ้งหนี้ / ใบเสร็จ)
 * อ้างอิงโครงสร้างตาม LINE Messaging API — https://developers.line.biz/en/docs/messaging-api/using-flex-messages/
 */
import { LINE_FLEX_BRAND_NAME } from '../../../core/constants.js';
import { env } from '../../../core/env/config.js';

export const LINE_FLEX_TEMPLATE_KINDS = [
  'DUE_SOON',
  'DUE_TODAY',
  'INVOICE',
  'OVERDUE',
  'RECEIPT',
  'SEVERE_DELINQUENCY',
  /** หลังระบบตัดงวดรายงานสำเร็จ (โฟลว์ webhook เดิม) */
  'INSTALLMENT_POSTED',
] as const;

export type LineFlexTemplateKind = (typeof LINE_FLEX_TEMPLATE_KINDS)[number];

export type FlexReceiptLine = { label: string; value: string };

export type FlexNotifyContext = {
  contractRef?: string;
  installmentRef?: string;
  /** แสดงเป็นวันที่ครบกำหนด (ข้อความอิสระ เช่น 17 เม.ย. 2569) */
  dueDate?: string;
  /** ยอดที่เกี่ยวข้อง (แสดงเป็นตัวเลข) */
  amountBaht?: number;
  /** เกินกำหนดกี่วัน */
  overdueDays?: number;
  /** จำนวนงวดที่ค้าง */
  overdueInstallmentCount?: number;
  /** สถานะหรือข้อความเสริม */
  status?: string;
  /** รายการบรรทัดใน bubble แบบใบเสร็จ */
  receiptLines?: FlexReceiptLine[];
  /** เลขที่อ้างอิงใบเสร็จ */
  receiptId?: string;
  /** เปิด LIFF ใบแจ้งหนี้ — ถ้าไม่ส่งจะใช้ LINE_LIFF_INVOICE_URL + query */
  invoiceLiffUri?: string;
  /** เปิด LIFF ใบเสร็จ / รายละเอียด */
  receiptLiffUri?: string;
};

function brandName(): string {
  return LINE_FLEX_BRAND_NAME;
}

function fmtBaht(n?: number): string | undefined {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return `${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

function text(
  t: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'text', text: t, ...extra };
}

function sep(margin = 'md'): Record<string, unknown> {
  return { type: 'separator', margin };
}

function rowSm(label: string, value: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      text(label, { size: 'sm', color: '#555555', flex: 2, wrap: true }),
      text(value, { size: 'sm', color: '#111111', align: 'end', flex: 3, wrap: true }),
    ],
  };
}

function optionalHero(): Record<string, unknown> | undefined {
  const url = env.LINE_FLEX_HERO_IMAGE_URL?.trim();
  if (!url) return undefined;
  return {
    type: 'image',
    url,
    size: 'full',
    aspectRatio: '20:13',
    aspectMode: 'cover',
  };
}

/** ต่อ query string บน URL เดิม (รองรับ base ที่มี query อยู่แล้ว) */
export function appendQueryToUri(base: string, q: Record<string, string | undefined>): string {
  try {
    const u = new URL(base);
    for (const [k, v] of Object.entries(q)) {
      if (v) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return base;
  }
}

function resolvedInvoiceUri(ctx: FlexNotifyContext): string | undefined {
  if (ctx.invoiceLiffUri?.trim()) return ctx.invoiceLiffUri.trim();
  const base = env.LINE_LIFF_INVOICE_URL?.trim();
  if (!base) return undefined;
  return appendQueryToUri(base, {
    contractRef: ctx.contractRef,
    installmentRef: ctx.installmentRef,
  });
}

function resolvedReceiptUri(ctx: FlexNotifyContext): string | undefined {
  if (ctx.receiptLiffUri?.trim()) return ctx.receiptLiffUri.trim();
  const base = env.LINE_LIFF_RECEIPT_URL?.trim();
  if (!base) return undefined;
  return appendQueryToUri(base, {
    contractRef: ctx.contractRef,
    installmentRef: ctx.installmentRef,
    receiptId: ctx.receiptId,
  });
}

function footerButtons(actions: { label: string; uri: string }[]): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: actions.map((a) => ({
      type: 'button',
      style: 'link',
      height: 'sm',
      action: { type: 'uri', label: a.label, uri: a.uri },
    })),
  };
}

function bubble(
  bodyContents: Record<string, unknown>[],
  footer?: Record<string, unknown>,
  hero?: Record<string, unknown>,
): Record<string, unknown> {
  const b: Record<string, unknown> = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
  };
  if (hero) b.hero = hero;
  if (footer) b.footer = footer;
  return b;
}

/** สร้าง object `contents` ของข้อความประเภท flex (bubble root) */
export function buildFlexNotifyBubble(
  kind: LineFlexTemplateKind,
  ctx: FlexNotifyContext,
): Record<string, unknown> {
  const hero = optionalHero();
  const b = brandName();

  switch (kind) {
    case 'DUE_SOON': {
      const body: Record<string, unknown>[] = [
        text('ใกล้ถึงกำหนดชำระ', { weight: 'bold', size: 'xl', color: '#E65100' }),
        text(b, { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
        text('กรุณาเตรียมชำระงวดผ่อนให้ตรงเวลา เพื่อหลีกเลี่ยงค่าปรับ', {
          size: 'sm',
          color: '#666666',
          wrap: true,
          margin: 'md',
        }),
        sep('lg'),
      ];
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.installmentRef) body.push(rowSm('งวด', ctx.installmentRef));
      if (ctx.dueDate) body.push(rowSm('ครบกำหนด', ctx.dueDate));
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(rowSm('ยอดงวด', amt));
      return bubble(body, undefined, hero);
    }

    case 'DUE_TODAY': {
      const body: Record<string, unknown>[] = [
        text('ถึงกำหนดชำระแล้ว', { weight: 'bold', size: 'xl', color: '#1565C0' }),
        text(b, { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
        text('วันนี้เป็นวันครบกำหนดชำระงวด กรุณาชำระผ่านช่องทางที่กำหนด', {
          size: 'sm',
          color: '#666666',
          wrap: true,
          margin: 'md',
        }),
        sep('lg'),
      ];
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.installmentRef) body.push(rowSm('งวด', ctx.installmentRef));
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(rowSm('ยอดที่ต้องชำระ', amt));
      return bubble(body, undefined, hero);
    }

    case 'INVOICE': {
      const body: Record<string, unknown>[] = [
        text('ใบแจ้งหนี้', { weight: 'bold', color: '#2E7D32', size: 'sm' }),
        text('งวดผ่อน', { weight: 'bold', size: 'xxl', margin: 'md' }),
        text(b, { size: 'xs', color: '#aaaaaa', wrap: true }),
        sep('xxl'),
      ];
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.installmentRef) body.push(rowSm('งวด', ctx.installmentRef));
      if (ctx.dueDate) body.push(rowSm('ครบกำหนด', ctx.dueDate));
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(rowSm('ยอด', amt));
      const inv = resolvedInvoiceUri(ctx);
      const footer = inv ? footerButtons([{ label: 'ดูใบแจ้งหนี้', uri: inv }]) : undefined;
      return bubble(body, footer, hero);
    }

    case 'OVERDUE': {
      const body: Record<string, unknown>[] = [
        text('เกินกำหนดชำระ', { weight: 'bold', size: 'xl', color: '#C62828' }),
        text(b, { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
        text('งวดนี้เลยกำหนดชำระแล้ว กรุณาชำระโดยเร็ว', {
          size: 'sm',
          color: '#666666',
          wrap: true,
          margin: 'md',
        }),
        sep('lg'),
      ];
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.installmentRef) body.push(rowSm('งวด', ctx.installmentRef));
      if (ctx.overdueDays !== undefined) body.push(rowSm('เกินกำหนด', `${ctx.overdueDays} วัน`));
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(rowSm('ยอดค้าง', amt));
      const inv = resolvedInvoiceUri(ctx);
      const footer = inv ? footerButtons([{ label: 'ดูใบแจ้งหนี้', uri: inv }]) : undefined;
      return bubble(body, footer, hero);
    }

    case 'RECEIPT': {
      const body: Record<string, unknown>[] = [
        text('ใบเสร็จ', { weight: 'bold', color: '#1DB446', size: 'sm' }),
        text('ชำระเงินแล้ว', { weight: 'bold', size: 'xxl', margin: 'md' }),
        text(b, { size: 'xs', color: '#aaaaaa', wrap: true }),
        sep('xxl'),
      ];
      const lines = ctx.receiptLines?.length
        ? ctx.receiptLines
        : [
            ...(ctx.contractRef ? [{ label: 'สัญญา', value: ctx.contractRef }] : []),
            ...(ctx.installmentRef ? [{ label: 'งวด', value: ctx.installmentRef }] : []),
          ];
      for (const line of lines) {
        body.push(rowSm(line.label, line.value));
      }
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(sep('md'), rowSm('รวม', amt));
      if (ctx.receiptId) {
        body.push(
          sep('lg'),
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              text('เลขที่อ้างอิง', { size: 'xs', color: '#aaaaaa', flex: 0 }),
              text(ctx.receiptId, { size: 'xs', color: '#aaaaaa', align: 'end', flex: 1, wrap: true }),
            ],
          },
        );
      }
      const rec = resolvedReceiptUri(ctx);
      const footer = rec ? footerButtons([{ label: 'ดูรายละเอียด', uri: rec }]) : undefined;
      return bubble(body, footer, hero);
    }

    case 'SEVERE_DELINQUENCY': {
      const count = ctx.overdueInstallmentCount;
      const body: Record<string, unknown>[] = [
        text('แจ้งเตือนสำคัญ', { weight: 'bold', size: 'xl', color: '#B71C1C' }),
        text(b, { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
        text(
          'ท่านมียอดค้างชำระหลายงวดในระดับที่ต้องดำเนินการทางกฎหมายและอาจมีการยึดทรัพย์ตามสัญญา กรุณาติดต่อเจ้าหน้าที่โดยทันที',
          { size: 'sm', color: '#424242', wrap: true, margin: 'md' },
        ),
        sep('lg'),
      ];
      if (count !== undefined) body.push(rowSm('จำนวนงวดค้าง', `${count} งวด`));
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.overdueDays !== undefined) body.push(rowSm('นานที่สุดเกินกำหนด', `${ctx.overdueDays} วัน`));
      const amt = fmtBaht(ctx.amountBaht);
      if (amt) body.push(rowSm('ยอดรวมโดยประมาณ', amt));
      const inv = resolvedInvoiceUri(ctx);
      const footer = inv ? footerButtons([{ label: 'ดูรายละเอียด / ติดต่อ', uri: inv }]) : undefined;
      return bubble(body, footer, hero);
    }

    case 'INSTALLMENT_POSTED': {
      const body: Record<string, unknown>[] = [
        text('ยืนยันการตัดงวด', { weight: 'bold', size: 'xl', color: '#2E7D32' }),
        text(b, { size: 'xs', color: '#aaaaaa', margin: 'sm' }),
        sep('md'),
      ];
      if (ctx.status) body.push(rowSm('สถานะ', ctx.status));
      if (ctx.contractRef) body.push(rowSm('สัญญา', ctx.contractRef));
      if (ctx.installmentRef) body.push(rowSm('งวด', ctx.installmentRef));
      return bubble(body, undefined, hero);
    }
  }
}

/** altText สำหรับ notification / โหมดสแกนข้อความ */
export function flexNotifyAltText(kind: LineFlexTemplateKind, ctx: FlexNotifyContext): string {
  const parts: string[] = [];
  switch (kind) {
    case 'DUE_SOON':
      parts.push('ใกล้ถึงกำหนดชำระ');
      break;
    case 'DUE_TODAY':
      parts.push('ถึงกำหนดชำระแล้ว');
      break;
    case 'INVOICE':
      parts.push('ใบแจ้งหนี้');
      break;
    case 'OVERDUE':
      parts.push('เกินกำหนดชำระ');
      break;
    case 'RECEIPT':
      parts.push('ใบเสร็จ');
      break;
    case 'SEVERE_DELINQUENCY':
      parts.push('แจ้งเตือน: ค้างหลายงวด');
      break;
    case 'INSTALLMENT_POSTED':
      parts.push('ยืนยันการตัดงวด');
      break;
  }
  if (ctx.contractRef) parts.push(ctx.contractRef);
  if (ctx.installmentRef) parts.push(`งวด ${ctx.installmentRef}`);
  return parts.join(' · ').slice(0, 380);
}
