/**
 * โหลด statement legacy จากไฟล์ใน `LEGACY_SQL_DIR` (ค่าเริ่มต้น `config/legacy-sql/`)
 * — ไม่เก็บ SQL ยาวใน .env
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../../core/env/config.js';

const FILES = {
  accCusByPhone: 'acc-cus-by-phone.sql',
  contractsByCustomer: 'contracts-by-customer.sql',
  contractDetail: 'contract-detail.sql',
  installmentsByContract: 'installments-by-contract.sql',
  receiptsByCustomer: 'receipts-by-customer.sql',
  lineLinkUpdate: 'line-link-update.sql',
  lineUserByCustomer: 'line-user-by-customer.sql',
  markInstallmentPaid: 'mark-installment-paid.sql',
} as const;

export type LegacySqlKey = keyof typeof FILES;

let cache: Record<LegacySqlKey, string | undefined> | null = null;

function sqlDir(): string {
  return join(process.cwd(), env.LEGACY_SQL_DIR);
}

/** ตัดบรรทัดที่เป็นคอมเมนต์ `--` เท่านั้น (บรรทัดแรกของบล็อก) */
function stripLineComments(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .trim();
}

function readOne(fileName: string): string | undefined {
  const full = join(sqlDir(), fileName);
  if (!existsSync(full)) return undefined;
  const text = stripLineComments(readFileSync(full, 'utf8'));
  return text.length > 0 ? text : undefined;
}

export function getLegacySqlTexts(): Record<LegacySqlKey, string | undefined> {
  if (!cache) {
    cache = {
      accCusByPhone: readOne(FILES.accCusByPhone),
      contractsByCustomer: readOne(FILES.contractsByCustomer),
      contractDetail: readOne(FILES.contractDetail),
      installmentsByContract: readOne(FILES.installmentsByContract),
      receiptsByCustomer: readOne(FILES.receiptsByCustomer),
      lineLinkUpdate: readOne(FILES.lineLinkUpdate),
      lineUserByCustomer: readOne(FILES.lineUserByCustomer),
      markInstallmentPaid: readOne(FILES.markInstallmentPaid),
    };
  }
  return cache;
}

/** ใช้ในเทสหรือ reload — ปกติไม่ต้องเรียก */
export function clearLegacySqlCache(): void {
  cache = null;
}
