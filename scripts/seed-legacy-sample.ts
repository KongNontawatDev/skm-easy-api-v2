/**
 * ใส่ข้อมูล legacy ตัวอย่างครบชุดตาม `db/เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql` (18 ตาราง)
 * เชื่อมโยง: ลูกค้า → ที่อยู่ → รุ่น/รหัสสินค้า/สต็อกรถ → สัญญา → รถในสัญญา → ผู้ค้ำ → งวด/ใบเสร็จ + master อ้างอิง
 *
 * อ่าน DATABASE_URL จาก .env.dev
 * รัน: npm run seed:legacy-sample
 *
 * ตาราง: ac_model, ac_submodel, acct_cust, acct_cust_address, artcolor_table, artmas_car,
 *         artmas_table, color_table, hp_category, hp_color, hp_model, hpcar, hpcontract,
 *         hpguar, hpreceipt_detail, hpreceipt_header, hptrancde, title_table
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.dev') });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing — ใส่ใน .env.dev');

const C = {
  COMPID: 'SKM',
  CMPCDE: 'SKM',
  IDNO: '1199900862730',
  BRANID: '001',
  CONT1: 'HP-DEV-2026-00001',
  CONT2: 'HP-DEV-2026-00002',
  PHONE: '0644870915',
  MODEL_CIV: 'SKM-DEV-HONDACIV',
  MODEL_HIL: 'SKM-DEV-TOYHIL',
  SUB_CIV: 'EHEVRS',
  SUB_HIL: 'PRERUN',
  ART_CIV: 'SKM-DEV-ART-CIV01',
  ART_HIL: 'SKM-DEV-ART-HLX01',
  CHAS_CIV: 'MRHFD1610PY501234',
  CHAS_HIL: 'MR0CB8CDX00256789',
  LIC_CIV: '1กข 8521',
  LIC_HIL: 'ขข 4149',
  COL_B01: 'B01',
  COL_T01: 'T01',
  CAT_SEED: 'Z9',
  TR_INST: 'INST',
  TR_VAT: 'VATX',
} as const;

async function main(): Promise<void> {
  const { prisma } = await import('../src/core/db/client.js');
  async function exec(label: string, sql: string): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.error(`[${label}] ล้มเหลว:\n${sql.slice(0, 240)}…`);
      throw e;
    }
  }

  const stmts: { label: string; sql: string }[] = [
    { label: 'ลบ artcolor_table (ตัวอย่าง)', sql: `DELETE FROM artcolor_table WHERE COMPID = '${C.COMPID}' AND ARTNO IN ('${C.ART_CIV}','${C.ART_HIL}')` },
    { label: 'ลบ artmas_car (ตัวอย่าง)', sql: `DELETE FROM artmas_car WHERE COMPID = '${C.COMPID}' AND ARTNO IN ('${C.ART_CIV}','${C.ART_HIL}')` },
    { label: 'ลบ artmas_table (ตัวอย่าง)', sql: `DELETE FROM artmas_table WHERE COMPID = '${C.COMPID}' AND ARTNO IN ('${C.ART_CIV}','${C.ART_HIL}')` },
    {
      label: 'ลบ ac_submodel (ตัวอย่าง)',
      sql: `DELETE FROM ac_submodel WHERE COMPID = '${C.COMPID}' AND MODELID IN ('${C.MODEL_CIV}','${C.MODEL_HIL}')`,
    },
    {
      label: 'ลบ ac_model (ตัวอย่าง)',
      sql: `DELETE FROM ac_model WHERE COMPID = '${C.COMPID}' AND MODELID IN ('${C.MODEL_CIV}','${C.MODEL_HIL}')`,
    },
    {
      label: 'ลบ hpguar (ตัวอย่าง)',
      sql: `DELETE FROM hpguar WHERE BRANID = '${C.BRANID}' AND CONTNO IN ('${C.CONT1}','${C.CONT2}')`,
    },
    {
      label: 'ลบ hpreceipt_detail (ตัวอย่าง)',
      sql: `DELETE FROM hpreceipt_detail WHERE BRANID = '${C.BRANID}' AND CONTNO IN ('${C.CONT1}','${C.CONT2}')`,
    },
    {
      label: 'ลบ hpreceipt_header (ตัวอย่าง)',
      sql: `DELETE FROM hpreceipt_header WHERE BRANID = '${C.BRANID}' AND CONTNO IN ('${C.CONT1}','${C.CONT2}')`,
    },
    {
      label: 'ลบ hpcar (ตัวอย่าง)',
      sql: `DELETE FROM hpcar WHERE BRANID = '${C.BRANID}' AND CONTNO IN ('${C.CONT1}','${C.CONT2}')`,
    },
    {
      label: 'ลบ hpcontract (ตัวอย่าง)',
      sql: `DELETE FROM hpcontract WHERE BRANID = '${C.BRANID}' AND CONTNO IN ('${C.CONT1}','${C.CONT2}')`,
    },
    {
      label: 'ลบ acct_cust_address (ตัวอย่าง)',
      sql: `DELETE FROM acct_cust_address WHERE COMPID = '${C.COMPID}' AND IDNO = '${C.IDNO}'`,
    },
    { label: 'ลบ acct_cust (ตัวอย่าง)', sql: `DELETE FROM acct_cust WHERE COMPID = '${C.COMPID}' AND IDNO = '${C.IDNO}'` },
    {
      label: 'ลบ hptrancde เฉพาะรหัส seed',
      sql: `DELETE FROM hptrancde WHERE COMPID = '${C.COMPID}' AND TRANCDE IN ('${C.TR_INST}','${C.TR_VAT}')`,
    },

    {
      label: 'title_table (คำนำหน้า)',
      sql: `INSERT IGNORE INTO title_table (TITCDE, TITNAM, SEQ) VALUES ('01', 'นาย', '1'), ('02', 'นาง', '2')`,
    },
    {
      label: 'hp_category',
      sql: `INSERT IGNORE INTO hp_category (CATEGORY, CATEGORYNAM) VALUES ('${C.CAT_SEED}', 'รถยนต์ตัวอย่างระบบ')`,
    },
    {
      label: 'hp_model',
      sql: `INSERT IGNORE INTO hp_model (CMPCDE, BRAND, MODEL, THDESC) VALUES
('${C.CMPCDE}', 'HONDA', 'CIVIC e:HEV RS', 'ฮอนด้า ซีวิค อี:เอชอีวี อาร์เอส'),
('${C.CMPCDE}', 'TOYOTA', 'HILUX Revo Prerunner', 'โตโยต้า ไฮลักซ์ รีโว่ พรีรันเนอร์')`,
    },
    {
      label: 'hp_color',
      sql: `INSERT IGNORE INTO hp_color (CMPCDE, COLOR, THDESC, ENDESC) VALUES
('${C.CMPCDE}', '${C.COL_B01}', 'ดำมุก', 'Black Pearl'),
('${C.CMPCDE}', '${C.COL_T01}', 'ขาว', 'White')`,
    },
    {
      label: 'color_table',
      sql: `INSERT IGNORE INTO color_table (COLOR, COLORNAM, COLORENG, COLORNAMEVAT) VALUES
('${C.COL_B01}', 'คริสตัลแบล็กเพิร์ล', 'Crystal Black Pearl', NULL),
('${C.COL_T01}', 'ซูเปอร์ไวท์ II', 'Super White II', NULL)`,
    },
    {
      label: 'hptrancde (รหัสทำรายการใบเสร็จ)',
      sql: `INSERT INTO hptrancde (COMPID, TRANCDE, TRANNAME, VATCDE) VALUES
('${C.COMPID}', '${C.TR_INST}', 'รับชำระค่างวดผ่อน', 'Y'),
('${C.COMPID}', '${C.TR_VAT}', 'ภาษีมูลค่าเพิ่ม', 'Y')`,
    },
    {
      label: 'ac_model',
      sql: `INSERT INTO ac_model (COMPID, MODELID, MODELNAM) VALUES
('${C.COMPID}', '${C.MODEL_CIV}', 'HONDA CIVIC e:HEV (ตัวอย่าง)'),
('${C.COMPID}', '${C.MODEL_HIL}', 'TOYOTA HILUX Revo (ตัวอย่าง)')`,
    },
    {
      label: 'ac_submodel',
      sql: `INSERT INTO ac_submodel (COMPID, SUBMODELID, SUMMODELNAM, MODELID) VALUES
('${C.COMPID}', '${C.SUB_CIV}', 'e:HEV RS', '${C.MODEL_CIV}'),
('${C.COMPID}', '${C.SUB_HIL}', 'Prerunner', '${C.MODEL_HIL}')`,
    },
    {
      label: 'artmas_table (รหัสสินค้า/รถในสต็อก)',
      sql: `INSERT INTO artmas_table (COMPID, ARTNO, ARTNAM, MODELID, SUBMODELID, CATEGORYID, ARTDESC) VALUES
('${C.COMPID}', '${C.ART_CIV}', 'HONDA CIVIC e:HEV RS ปี 2023', '${C.MODEL_CIV}', '${C.SUB_CIV}', '${C.CAT_SEED}', 'รถตัวอย่างสำหรับสัญญา HP-DEV-2026-00001'),
('${C.COMPID}', '${C.ART_HIL}', 'TOYOTA HILUX Revo Prerunner ปี 2022', '${C.MODEL_HIL}', '${C.SUB_HIL}', '${C.CAT_SEED}', 'รถตัวอย่างสำหรับสัญญา HP-DEV-2026-00002')`,
    },
    {
      label: 'artmas_car (เลขถังผูกสาขา/ลูกค้า)',
      sql: `INSERT INTO artmas_car (COMPID, ARTNO, CHASNO, BRANID, ENGNO, COLOR, CARYEAR, CARSTA, LICNO, IDNO) VALUES
('${C.COMPID}', '${C.ART_CIV}', '${C.CHAS_CIV}', '${C.BRANID}', 'L15B901234', '${C.COL_B01}', 2023, '3', '${C.LIC_CIV}', '${C.IDNO}'),
('${C.COMPID}', '${C.ART_HIL}', '${C.CHAS_HIL}', '${C.BRANID}', '1GD-FTV998877', '${C.COL_T01}', 2022, '3', '${C.LIC_HIL}', '${C.IDNO}')`,
    },
    {
      label: 'artcolor_table',
      sql: `INSERT INTO artcolor_table (COMPID, ARTNO, COLOR, TOTPURCAMT) VALUES
('${C.COMPID}', '${C.ART_CIV}', '${C.COL_B01}', 850000.00),
('${C.COMPID}', '${C.ART_HIL}', '${C.COL_T01}', 465000.00)`,
    },
    {
      label: 'acct_cust',
      sql: `INSERT INTO acct_cust (COMPID, IDNO, TITCDE, THNAME, THSURN, TELNO, CIDNUM, CUSTSTAT, GENDER, CREATEDATE)
VALUES ('${C.COMPID}', '${C.IDNO}', '01', 'สมชาย', 'ใจดี', '${C.PHONE}', '${C.IDNO}', '1', 'M', CURDATE())`,
    },
    {
      label: 'acct_cust_address (ทะเบียนบ้าน + ที่อยู่ปัจจุบัน)',
      sql: `INSERT INTO acct_cust_address (COMPID, IDNO, ADRTYP, ADDRESS, PROVINCENAMES, ZIPCODE, MOBILE) VALUES
('${C.COMPID}', '${C.IDNO}', '01', '88/22 หมู่บ้านตัวอย่าง ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท', 'กรุงเทพมหานคร', 10400, '${C.PHONE}'),
('${C.COMPID}', '${C.IDNO}', '02', '999/1 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ', 'กรุงเทพมหานคร', 10400, '${C.PHONE}')`,
    },
    {
      label: 'hpcontract',
      sql: `INSERT INTO hpcontract (
  BRANID, CONTNO, COMPID, IDNO, CONTSTS, APRVDTE, FIRSTDTE, ENDDTE,
  OUTSBAL, TERM, INSTAMT, FINAMT, HIRAMT, NETFINAMT
) VALUES
(
  '${C.BRANID}', '${C.CONT1}', '${C.COMPID}', '${C.IDNO}', 'A',
  '2025-11-18', '2026-05-05', '2028-11-18',
  325500.00, 36, 9500.00, 720000.00, 850000.00, 720000.00
),
(
  '${C.BRANID}', '${C.CONT2}', '${C.COMPID}', '${C.IDNO}', 'A',
  '2024-06-10', '2026-04-25', '2027-06-10',
  128000.00, 36, 5200.00, 380000.00, 420000.00, 380000.00
)`,
    },
    {
      label: 'hpcar',
      sql: `INSERT INTO hpcar (BRANID, CONTNO, COMPID, BRAND, MODEL, CARYEAR, COLOR, LICNO, CHASNO) VALUES
('${C.BRANID}', '${C.CONT1}', '${C.COMPID}', 'HONDA', 'CIVIC e:HEV RS', 2023, '${C.COL_B01}', '${C.LIC_CIV}', '${C.CHAS_CIV}'),
('${C.BRANID}', '${C.CONT2}', '${C.COMPID}', 'TOYOTA', 'HILUX Revo Prerunner', 2022, '${C.COL_T01}', '${C.LIC_HIL}', '${C.CHAS_HIL}')`,
    },
    {
      label: 'hpguar (ผู้ค้ำประกัน)',
      sql: `INSERT INTO hpguar (BRANID, GTYSEQ, CONTNO, COMPID, GTYIDNO, TRANDTE, RECSTS, RELAITONCDE) VALUES
('${C.BRANID}', 1, '${C.CONT1}', '${C.COMPID}', '3100555666777', '2025-11-18', '1', '02'),
('${C.BRANID}', 1, '${C.CONT2}', '${C.COMPID}', '3100666777888', '2024-06-10', '1', '02')`,
    },
    {
      label: 'hpreceipt_header',
      sql: `INSERT INTO hpreceipt_header (BRANID, RCPNO, TRANSTS, COMPID, CONTNO, RCPDTE, RCPAMT, TRANRCDSTS) VALUES
('${C.BRANID}', 'RCPDEV0001', '1', '${C.COMPID}', '${C.CONT1}', '2026-01-10', 9500.00, '1'),
('${C.BRANID}', 'RCPDEV0002', '1', '${C.COMPID}', '${C.CONT1}', '2026-02-08', 9500.00, '1'),
('${C.BRANID}', 'RCPDEV0003', '1', '${C.COMPID}', '${C.CONT2}', '2026-03-01', 5200.00, '1')`,
    },
  ];

  const sched1: [number, string, string][] = [
    [1, '2025-12-18', '1'],
    [2, '2026-01-18', '1'],
    [3, '2026-02-18', '1'],
    [4, '2026-03-18', '1'],
    [5, '2026-04-05', '0'],
    [6, '2026-05-18', '0'],
    [7, '2026-06-18', '0'],
    [8, '2026-07-18', '0'],
    [9, '2026-08-18', '0'],
    [10, '2026-09-18', '0'],
    [11, '2026-10-18', '0'],
    [12, '2026-11-18', '0'],
  ];
  const amt1 = 9500;
  const dueRows = sched1.map(
    ([p, due, st]) =>
      `('${C.BRANID}', 'SCH-DEV-01', '1', ${p}, '${C.COMPID}', '${C.CONT1}', ${p}, '${due}', ${amt1}.00, '${st}', '${C.TR_INST}')`,
  );
  stmts.push({
    label: 'hpreceipt_detail สัญญา 1',
    sql: `INSERT INTO hpreceipt_detail (BRANID, RCPNO, TRANSTS, UNIQUEREC, COMPID, CONTNO, INSTPERIOD, INSTDUEDTE, AMOUNT, TRANRCDSTS, TRANCDE) VALUES ${dueRows.join(',\n')}`,
  });

  const sched2: [number, string, string][] = [
    [1, '2025-07-10', '1'],
    [2, '2025-08-10', '1'],
    [3, '2025-09-10', '1'],
    [4, '2025-10-10', '1'],
    [5, '2025-11-10', '1'],
    [6, '2025-12-10', '0'],
    [7, '2026-01-10', '0'],
    [8, '2026-02-10', '0'],
  ];
  const amt2 = 5200;
  const rows2 = sched2.map(
    ([p, due, st]) =>
      `('${C.BRANID}', 'SCH-DEV-02', '1', ${p}, '${C.COMPID}', '${C.CONT2}', ${p}, '${due}', ${amt2}.00, '${st}', '${C.TR_INST}')`,
  );
  stmts.push({
    label: 'hpreceipt_detail สัญญา 2',
    sql: `INSERT INTO hpreceipt_detail (BRANID, RCPNO, TRANSTS, UNIQUEREC, COMPID, CONTNO, INSTPERIOD, INSTDUEDTE, AMOUNT, TRANRCDSTS, TRANCDE) VALUES ${rows2.join(',\n')}`,
  });

  for (const { label, sql } of stmts) {
    await exec(label, sql);
    console.log('✓', label);
  }

  console.log(`
ครบ 18 ตาราง (ชุดตัวอย่างที่เชื่อมกัน)
  OTP เบอร์: ${C.PHONE}  |  legacyCustomerId: ${C.COMPID}:${C.IDNO}
  สัญญา: ${C.BRANID}:${C.CONT1}, ${C.BRANID}:${C.CONT2}
  สินค้า/ถัง: ${C.ART_CIV} / ${C.ART_HIL}  ↔  CHASNO เดียวกับ hpcar
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('../src/core/db/client.js');
    await prisma.$disconnect();
  });
