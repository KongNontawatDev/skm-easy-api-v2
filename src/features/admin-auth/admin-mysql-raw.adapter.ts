/**
 * Better Auth — adapter ฐานข้อมูลผ่าน Prisma `$queryRaw` / `$executeRaw` เท่านั้น (ไม่ใช้ Prisma model delegate)
 * อิงพฤติกรรมจาก `@better-auth/prisma-adapter` แต่ส่ง SQL ไปที่ MariaDB โดยตรง
 */
import { BetterAuthError } from '@better-auth/core/error';
import { createAdapterFactory } from '@better-auth/core/db/adapter';
import type { CleanedWhere, JoinConfig } from '@better-auth/core/db/adapter';
import type { PrismaClient } from '@prisma/client';

const MODEL_TABLE: Record<string, string> = {
  adminAuthUser: 'admin_auth_user',
  adminAuthSession: 'admin_auth_session',
  adminAuthAccount: 'admin_auth_account',
  adminAuthVerification: 'admin_auth_verification',
};

function tableForModel(model: string): string {
  const t = MODEL_TABLE[model];
  if (!t) throw new BetterAuthError(`Model ${model} is not mapped to a MySQL table for raw adapter`);
  return t;
}

function qIdent(name: string): string {
  return '`' + name.replace(/`/g, '') + '`';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function walkField(field: string, cond: unknown, values: unknown[]): string {
  const col = qIdent(field);
  if (cond === null) return `${col} IS NULL`;
  if (typeof cond !== 'object' || cond instanceof Date) {
    values.push(cond);
    return `${col} = ?`;
  }
  const c = cond as Record<string, unknown>;
  if ('equals' in c) {
    if (c.equals === null) return `${col} IS NULL`;
    values.push(c.equals);
    return `${col} = ?`;
  }
  if ('not' in c) {
    const n = c.not;
    if (n === null) return `${col} IS NOT NULL`;
    if (typeof n === 'object' && n !== null && 'equals' in (n as Record<string, unknown>)) {
      values.push((n as { equals: unknown }).equals);
      return `${col} <> ?`;
    }
  }
  if ('in' in c && Array.isArray(c.in)) {
    const arr = c.in.filter((x) => x != null);
    if (arr.length === 0) return 'FALSE';
    const ph = arr.map((v) => {
      values.push(v);
      return '?';
    });
    return `${col} IN (${ph.join(', ')})`;
  }
  if ('notIn' in c && Array.isArray(c.notIn)) {
    const arr = (c.notIn as unknown[]).filter((x) => x != null);
    if (arr.length === 0) return 'TRUE';
    const ph = arr.map((v) => {
      values.push(v);
      return '?';
    });
    return `${col} NOT IN (${ph.join(', ')})`;
  }
  if ('lt' in c) {
    values.push(c.lt);
    return `${col} < ?`;
  }
  if ('lte' in c) {
    values.push(c.lte);
    return `${col} <= ?`;
  }
  if ('gt' in c) {
    values.push(c.gt);
    return `${col} > ?`;
  }
  if ('gte' in c) {
    values.push(c.gte);
    return `${col} >= ?`;
  }
  if ('startsWith' in c && typeof c.startsWith === 'string') {
    values.push(`${c.startsWith}%`);
    return `${col} LIKE ?`;
  }
  if ('endsWith' in c && typeof c.endsWith === 'string') {
    values.push(`%${c.endsWith}`);
    return `${col} LIKE ?`;
  }
  if ('contains' in c && typeof c.contains === 'string') {
    values.push(`%${c.contains}%`);
    return `${col} LIKE ?`;
  }
  throw new BetterAuthError(`Unsupported where operator for field ${field}: ${JSON.stringify(cond)}`);
}

function walkWhere(where: Record<string, unknown> | undefined, values: unknown[]): string {
  if (!where || Object.keys(where).length === 0) return 'TRUE';
  const parts: string[] = [];
  if (Array.isArray(where.AND)) {
    const inner = where.AND.map((x) => `(${walkWhere(asRecord(x), values)})`).join(' AND ');
    if (inner.trim()) parts.push(inner);
  }
  if (Array.isArray(where.OR)) {
    const inner = where.OR.map((x) => `(${walkWhere(asRecord(x), values)})`).join(' OR ');
    if (inner.trim()) parts.push(`(${inner})`);
  }
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND' || k === 'OR') continue;
    parts.push(walkField(k, v, values));
  }
  const joined = parts.filter(Boolean).join(' AND ');
  return joined.length ? joined : 'TRUE';
}

function operatorToPrismaOperator(operator: string): string {
  switch (operator) {
    case 'starts_with':
      return 'startsWith';
    case 'ends_with':
      return 'endsWith';
    case 'ne':
      return 'not';
    case 'not_in':
      return 'notIn';
    default:
      return operator;
  }
}

function hasRootUniqueWhereCondition(
  model: string,
  where: CleanedWhere[] | undefined,
  getFieldAttributes: (a: { model: string; field: string }) => { unique?: boolean },
): boolean {
  if (!where?.length) return false;
  return where.some((condition) => {
    if (condition.connector === 'OR') return false;
    if (condition.operator && condition.operator !== 'eq') return false;
    if (condition.mode === 'insensitive') return false;
    if (condition.field === 'id') return true;
    return getFieldAttributes({ model, field: condition.field })?.unique === true;
  });
}

export function adminMysqlRawAdapter(prisma: PrismaClient) {
  const createCustomAdapter =
    (db: PrismaClient) =>
    ({
      getFieldName,
      getModelName,
      getFieldAttributes,
      getDefaultModelName,
      schema,
    }: {
      getFieldName: (a: { model: string; field: string }) => string;
      getModelName: (model: string) => string;
      getFieldAttributes: (a: { model: string; field: string }) => { unique?: boolean; required?: boolean };
      getDefaultModelName: (model: string) => string;
      schema: Record<string, { fields?: Record<string, unknown> }>;
    }) => {
      const getJoinKeyName = (baseModel: string, joinedModel: string): string => {
        try {
          const defaultBaseModelName = getDefaultModelName(baseModel);
          const defaultJoinedModelName = getDefaultModelName(joinedModel);
          const key = getModelName(joinedModel).toLowerCase();
          let foreignKeys = Object.entries(schema[defaultJoinedModelName]?.fields || {}).filter(
            ([, fieldAttributes]) =>
              (fieldAttributes as { references?: { model: string } }).references &&
              getDefaultModelName((fieldAttributes as { references: { model: string } }).references.model) ===
                defaultBaseModelName,
          );
          if (foreignKeys.length > 0) {
            const [, foreignKeyAttributes] = foreignKeys[0]!;
            return (foreignKeyAttributes as { unique?: boolean })?.unique === true ? key : `${key}s`;
          }
          foreignKeys = Object.entries(schema[defaultBaseModelName]?.fields || {}).filter(
            ([, fieldAttributes]) =>
              (fieldAttributes as { references?: { model: string } }).references &&
              getDefaultModelName((fieldAttributes as { references: { model: string } }).references.model) ===
                defaultJoinedModelName,
          );
          if (foreignKeys.length > 0) return key;
        } catch {
          /* noop */
        }
        return `${getModelName(joinedModel).toLowerCase()}s`;
      };

      const convertSelect = (
        select: string[] | undefined,
        model: string,
        join?: Record<string, { on: { from: string; to: string }; limit: number; relation: string }>,
      ): Record<string, boolean> | undefined => {
        if (!select && !join) return undefined;
        const result: Record<string, boolean> = {};
        if (select) for (const field of select) result[getFieldName({ model, field })] = true;
        if (join) {
          if (!select) {
            const fields = schema[getDefaultModelName(model)]?.fields || {};
            (result as Record<string, boolean>).id = true;
            for (const field of Object.keys(fields)) result[getFieldName({ model, field })] = true;
          }
          for (const [joinModel, joinAttr] of Object.entries(join)) {
            const key = getJoinKeyName(model, joinModel);
            if ((joinAttr as { relation: string }).relation === 'one-to-one') result[key] = true;
            else result[key] = true;
          }
        }
        return result;
      };

      const buildSingleCondition = (
        model: string,
        w: { field: string; value: unknown; operator?: string; mode?: string },
      ): Record<string, unknown> => {
        const fieldName = getFieldName({ model, field: w.field });
        const isInsensitive =
          (w.mode ?? 'sensitive') === 'insensitive' &&
          (typeof w.value === 'string' || (Array.isArray(w.value) && w.value.every((v) => typeof v === 'string')));
        const providerSupportsMode = false;
        const prismaMode = isInsensitive && providerSupportsMode ? 'insensitive' : undefined;
        const modeFilter = prismaMode ? { mode: prismaMode } : {};
        if (w.operator === 'ne' && w.value === null)
          return getFieldAttributes({ model, field: w.field })?.required !== true ? { [fieldName]: { not: null } } : {};
        if ((w.operator === 'in' || w.operator === 'not_in') && Array.isArray(w.value)) {
          const filtered = w.value.filter((v) => v != null);
          if (filtered.length === 0)
            if (w.operator === 'in')
              return { AND: [{ [fieldName]: { equals: '__never__' } }, { [fieldName]: { not: '__never__' } }] };
            else return {};
          const prismaOp = operatorToPrismaOperator(w.operator);
          return { [fieldName]: { [prismaOp]: filtered, ...modeFilter } };
        }
        if (w.operator === 'eq' || !w.operator) return { [fieldName]: { equals: w.value, ...modeFilter } };
        if (w.operator === 'ne') return { [fieldName]: { not: { equals: w.value }, ...modeFilter } };
        const prismaOp = operatorToPrismaOperator(w.operator);
        return { [fieldName]: { [prismaOp]: w.value, ...modeFilter } };
      };

      const convertWhereClause = ({
        action,
        model,
        where,
      }: {
        action: string;
        model: string;
        where?: CleanedWhere[];
      }): Record<string, unknown> => {
        if (!where?.length) return {};
        if (action === 'update') {
          const and = where.filter((w) => w.connector === 'AND' || !w.connector);
          const or = where.filter((w) => w.connector === 'OR');
          const andSimple = and.filter((w) => w.operator === 'eq' || !w.operator);
          const andComplexClause = and
            .filter((w) => w.operator !== 'eq' && w.operator !== undefined)
            .map((w) => buildSingleCondition(model, w));
          const orClause = or.map((w) => buildSingleCondition(model, w));
          const result: Record<string, unknown> = {};
          for (const w of andSimple) {
            const fieldName = getFieldName({ model, field: w.field });
            result[fieldName] = w.value;
          }
          if (andComplexClause.length > 0) result.AND = andComplexClause;
          if (orClause.length > 0) result.OR = orClause;
          return result;
        }
        if (action === 'delete') {
          const idCondition = where.find((w) => w.field === 'id');
          if (idCondition) {
            const idFieldName = getFieldName({ model, field: 'id' });
            const remainingWhere = where.filter((w) => w.field !== 'id');
            if (remainingWhere.length === 0) return { [idFieldName]: idCondition.value };
            const and = remainingWhere.filter((w) => w.connector === 'AND' || !w.connector);
            const or = remainingWhere.filter((w) => w.connector === 'OR');
            const andClause = and.map((w) => buildSingleCondition(model, w));
            const orClause = or.map((w) => buildSingleCondition(model, w));
            const result: Record<string, unknown> = { [idFieldName]: idCondition.value };
            if (andClause.length > 0) result.AND = andClause;
            if (orClause.length > 0) result.OR = orClause;
            return result;
          }
        }
        if (where.length === 1) {
          const w = where[0];
          if (!w) return {};
          return buildSingleCondition(model, w);
        }
        const and = where.filter((w) => w.connector === 'AND' || !w.connector);
        const or = where.filter((w) => w.connector === 'OR');
        const andClause = and.map((w) => buildSingleCondition(model, w));
        const orClause = or.map((w) => buildSingleCondition(model, w));
        return {
          ...(andClause.length ? { AND: andClause } : {}),
          ...(orClause.length ? { OR: orClause } : {}),
        };
      };

      const selectColumns = (select: Record<string, boolean> | undefined): string => {
        if (!select) return '*';
        const cols = Object.keys(select).map((c) => qIdent(c));
        return cols.length ? cols.join(', ') : '*';
      };

      async function queryRows(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
        return db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
      }

      async function exec(sql: string, params: unknown[]): Promise<number> {
        const r = await db.$executeRawUnsafe(sql, ...params);
        return typeof r === 'number' ? r : Number(r);
      }

      return {
        async create<T extends Record<string, unknown>>({
          model,
          data: values,
          select,
        }: {
          model: string;
          data: T;
          select?: string[];
        }): Promise<T> {
          const table = tableForModel(model);
          const selObj = convertSelect(select, model);
          const cols = Object.keys(values);
          if (!cols.length) throw new BetterAuthError('create: empty data');
          const colSql = cols.map((c) => qIdent(c)).join(', ');
          const ph = cols.map(() => '?').join(', ');
          const params = cols.map((c) => values[c]);
          await exec(`INSERT INTO ${qIdent(table)} (${colSql}) VALUES (${ph})`, params);
          const idVal = values.id;
          const whereSql = idVal != null ? `${qIdent('id')} = ?` : 'FALSE';
          const wparams = idVal != null ? [idVal] : [];
          const rows = await queryRows(
            `SELECT ${selectColumns(selObj as Record<string, boolean> | undefined)} FROM ${qIdent(table)} WHERE ${whereSql} LIMIT 1`,
            wparams,
          );
          return (rows[0] ?? values) as T;
        },

        async findOne<T>({
          model,
          where,
          select,
          join,
        }: {
          model: string;
          where: CleanedWhere[];
          select?: string[];
          join?: JoinConfig;
        }): Promise<T | null> {
          const table = tableForModel(model);
          const wobj = convertWhereClause({ action: 'findOne', model, where });
          const vals: unknown[] = [];
          const whereSql = walkWhere(wobj, vals);
          const selObj = convertSelect(select, model, join as never);
          const rows = await queryRows(
            `SELECT ${selectColumns(selObj)} FROM ${qIdent(table)} WHERE ${whereSql} LIMIT 1`,
            vals,
          );
          const map = new Map<string, string>();
          if (join)
            for (const joinModel of Object.keys(join)) {
              const key = getJoinKeyName(model, joinModel);
              map.set(key, getModelName(joinModel));
            }
          const row0 = rows[0];
          let result: Record<string, unknown> | null = row0 ?? null;
          if (join && result)
            for (const [includeKey, originalKey] of map.entries()) {
              if (includeKey === originalKey) continue;
              if (includeKey in result) {
                result[originalKey] = result[includeKey];
                delete result[includeKey];
              }
            }
          return result as T | null;
        },

        async findMany<T>({
          model,
          where,
          limit,
          select,
          sortBy,
          offset,
          join,
        }: {
          model: string;
          where?: CleanedWhere[];
          limit: number;
          select?: string[];
          sortBy?: { field: string; direction: 'asc' | 'desc' };
          offset?: number;
          join?: JoinConfig;
        }): Promise<T[]> {
          const table = tableForModel(model);
          const wobj = convertWhereClause({ action: 'findMany', model, where });
          const vals: unknown[] = [];
          const whereSql = walkWhere(wobj, vals);
          const selObj = convertSelect(select, model, join as never);
          const order =
            sortBy?.field != null
              ? ` ORDER BY ${qIdent(getFieldName({ model, field: sortBy.field }))} ${sortBy.direction === 'desc' ? 'DESC' : 'ASC'}`
              : '';
          const off = offset && offset > 0 ? ` OFFSET ${Number(offset)}` : '';
          const lim = ` LIMIT ${Number(limit)}`;
          const rows = await queryRows(
            `SELECT ${selectColumns(selObj)} FROM ${qIdent(table)} WHERE ${whereSql}${order}${lim}${off}`,
            vals,
          );
          const map = new Map<string, string>();
          if (join)
            for (const joinModel of Object.keys(join)) {
              const key = getJoinKeyName(model, joinModel);
              map.set(key, getModelName(joinModel));
            }
          if (join && Array.isArray(rows))
            for (const item of rows) {
              const rec = item as Record<string, unknown>;
              for (const [includeKey, originalKey] of map.entries()) {
                if (includeKey === originalKey) continue;
                if (includeKey in rec) {
                  rec[originalKey] = rec[includeKey];
                  delete rec[includeKey];
                }
              }
            }
          return rows as T[];
        },

        async count({
          model,
          where,
        }: {
          model: string;
          where?: CleanedWhere[];
        }): Promise<number> {
          const table = tableForModel(model);
          const wobj = convertWhereClause({ action: 'count', model, where });
          const vals: unknown[] = [];
          const whereSql = walkWhere(wobj, vals);
          const rows = await queryRows(
            `SELECT COUNT(*) AS cnt FROM ${qIdent(table)} WHERE ${whereSql}`,
            vals,
          );
          const c = (rows[0] as { cnt?: bigint | number } | undefined)?.cnt ?? 0;
          return typeof c === 'bigint' ? Number(c) : Number(c);
        },

        async update<T>({
          model,
          where,
          update,
        }: {
          model: string;
          where: CleanedWhere[];
          update: T;
        }): Promise<T | null> {
          const table = tableForModel(model);
          const patch = update as Record<string, unknown>;
          if (!hasRootUniqueWhereCondition(model, where, getFieldAttributes)) {
            const whereClause = convertWhereClause({ model, where, action: 'updateMany' });
            const vals: unknown[] = [];
            const whereSql = walkWhere(whereClause, vals);
            const setKeys = Object.keys(patch);
            if (!setKeys.length) {
              const rows = await queryRows(`SELECT * FROM ${qIdent(table)} WHERE ${whereSql} LIMIT 1`, vals);
              return (rows[0] ?? null) as T | null;
            }
            const setParts = setKeys.map((k) => `${qIdent(k)} = ?`);
            const setVals = setKeys.map((k) => patch[k]);
            const affected = await exec(
              `UPDATE ${qIdent(table)} SET ${setParts.join(', ')} WHERE ${whereSql}`,
              [...setVals, ...vals],
            );
            if (!affected) return null;
            const rows = await queryRows(`SELECT * FROM ${qIdent(table)} WHERE ${whereSql} LIMIT 1`, vals);
            return (rows[0] ?? null) as T | null;
          }
          const whereClause = convertWhereClause({ model, where, action: 'update' });
          const vals: unknown[] = [];
          const whereSql = walkWhere(whereClause, vals);
          const setKeys = Object.keys(patch);
          const setParts = setKeys.map((k) => `${qIdent(k)} = ?`);
          const setVals = setKeys.map((k) => patch[k]);
          await exec(
            `UPDATE ${qIdent(table)} SET ${setParts.join(', ')} WHERE ${whereSql}`,
            [...setVals, ...vals],
          );
          const rows = await queryRows(`SELECT * FROM ${qIdent(table)} WHERE ${whereSql} LIMIT 1`, vals);
          return (rows[0] ?? null) as T | null;
        },

        async updateMany<T>({
          model,
          where,
          update,
        }: {
          model: string;
          where: CleanedWhere[];
          update: T;
        }): Promise<number> {
          const table = tableForModel(model);
          const patch = update as Record<string, unknown>;
          const whereClause = convertWhereClause({ model, where, action: 'updateMany' });
          const vals: unknown[] = [];
          const whereSql = walkWhere(whereClause, vals);
          const setKeys = Object.keys(patch);
          if (!setKeys.length) return 0;
          const setParts = setKeys.map((k) => `${qIdent(k)} = ?`);
          const setVals = setKeys.map((k) => patch[k]);
          return exec(`UPDATE ${qIdent(table)} SET ${setParts.join(', ')} WHERE ${whereSql}`, [...setVals, ...vals]);
        },

        async delete({
          model,
          where,
        }: {
          model: string;
          where: CleanedWhere[];
        }): Promise<void> {
          const table = tableForModel(model);
          if (!where?.some((w) => w.field === 'id')) {
            const whereClause = convertWhereClause({ model, where, action: 'deleteMany' });
            const vals: unknown[] = [];
            const whereSql = walkWhere(whereClause, vals);
            await exec(`DELETE FROM ${qIdent(table)} WHERE ${whereSql}`, vals);
            return;
          }
          const whereClause = convertWhereClause({ model, where, action: 'delete' });
          const vals: unknown[] = [];
          const whereSql = walkWhere(whereClause, vals);
          try {
            await exec(`DELETE FROM ${qIdent(table)} WHERE ${whereSql}`, vals);
          } catch {
            /* record missing */
          }
        },

        async deleteMany({
          model,
          where,
        }: {
          model: string;
          where: CleanedWhere[];
        }): Promise<number> {
          const table = tableForModel(model);
          const whereClause = convertWhereClause({ model, where, action: 'deleteMany' });
          const vals: unknown[] = [];
          const whereSql = walkWhere(whereClause, vals);
          return exec(`DELETE FROM ${qIdent(table)} WHERE ${whereSql}`, vals);
        },

        options: { provider: 'mysql' as const },
      };
    };

  const adapterOptions = {
    config: {
      adapterId: 'prisma-mysql-raw',
      adapterName: 'Prisma MySQL Raw',
      usePlural: false,
      supportsUUIDs: false,
      supportsArrays: false,
      transaction: false as const,
    },
    adapter: createCustomAdapter(prisma),
  };

  const adapter = createAdapterFactory(adapterOptions);
  return (options: unknown) => adapter(options as never);
}
