/**
 * ห่อ legacy SQL ของลูกค้าแอป + ตรวจสิทธิ์ว่า `contractRef` เป็นของลูกค้าจริง
 */
import { forbidden } from '../../core/http/errors.js';
import {
  getContractDetail,
  listContractsForCustomer,
  listInstallmentsByContract,
  listReceiptsForCustomer,
} from '../legacy-sql/legacy-sql.service.js';

const CONTRACT_REF_KEYS = [
  'contractRef',
  'contract_ref',
  'contractref',
  'CONT_NO',
  'cont_no',
  'contractNo',
  'CONTNO',
  'contno',
  'contract_id',
  'contractId',
] as const;

function extractContractRefs(rows: Record<string, unknown>[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    for (const k of CONTRACT_REF_KEYS) {
      const v = row[k];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s.length > 0) out.add(s);
      }
    }
  }
  return out;
}

export async function bumpCustomerLegacyCache(_legacyCustomerId: string): Promise<void> {
  /* no-op */
}

export async function listContractsForCustomerCached(legacyCustomerId: string): Promise<Record<string, unknown>[]> {
  return listContractsForCustomer(legacyCustomerId);
}

export async function assertCustomerOwnsContract(legacyCustomerId: string, contractRef: string): Promise<void> {
  const rows = await listContractsForCustomerCached(legacyCustomerId);
  if (!extractContractRefs(rows).has(contractRef)) {
    throw forbidden('ไม่มีสิทธิ์เข้าถึงสัญญานี้');
  }
}

export async function getContractDetailForCustomer(
  legacyCustomerId: string,
  contractRef: string,
): Promise<Record<string, unknown> | null> {
  await assertCustomerOwnsContract(legacyCustomerId, contractRef);
  return getContractDetail(contractRef);
}

export async function listInstallmentsForCustomerCached(
  legacyCustomerId: string,
  contractRef: string,
): Promise<Record<string, unknown>[]> {
  await assertCustomerOwnsContract(legacyCustomerId, contractRef);
  return listInstallmentsByContract(contractRef);
}

export async function listReceiptsForCustomerCached(legacyCustomerId: string): Promise<Record<string, unknown>[]> {
  return listReceiptsForCustomer(legacyCustomerId);
}
