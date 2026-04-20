-- 📌 ไฟล์นี้: คำแนะนำดัชนีบนตาราง legacy (MariaDB) — รันคู่มือหลังวิเคราะห์ execution plan จริง
-- ⚠️ ชื่อตาราง/คอลัมน์ต้องปรับให้ตรงกับ schema องค์กร — ห้ามรันตรง ๆ ถ้ายังไม่ตรวจสอบ

-- ตัวอย่าง: ค้นหา line_user_id ตามลูกค้า (ใช้หลังอนุมัติ > แจ้ง LINE) — ตาราง dump คือ `acct_cust`
-- CREATE INDEX IF NOT EXISTS idx_acct_cust_line_user_id ON acct_cust (line_user_id);

-- ตัวอย่าง: รายการสัญญา/งวดตามลูกค้า — ปรับชื่อคอลัมน์ให้ตรงกับ SQL ใน LEGACY_*_SQL
-- CREATE INDEX idx_contracts_customer ON contracts (cus_code);
-- CREATE INDEX idx_installments_contract ON installments (contract_no, due_date);
