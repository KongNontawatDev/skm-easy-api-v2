-- ⚠️ ทางเลือกเก่า — API v2 ใช้ตาราง `customer_liff_links` เป็นหลักสำหรับ LINE (ดู `sql/dba/HANDOFF_SKM_EASY_V2.sql` บล็อก F)
--     รันไฟล์นี้เฉพาะเมื่อต้องการเก็บ mirror บน `acct_cust` จริง ๆ (เช่น legacy อื่นที่อ่านจาก acct_cust)
--
-- รันบน MariaDB legacy — สคีมาตาราง `acct_cust` ตาม `db/เฉพาะตารางฐานข้อมูลที่เกี่ยวข้อง.sql`
-- (ชื่อไฟล์เดิมมีคำว่า acc_cus แต่ตารางจริงใน dump คือ acct_cust)
-- เพิ่มฟิลด์ LINE สำหรับผูกบัญชีแอป — สำเนาเดียวกับ `db/alter_acct_cust_line_skm_easy.sql`

ALTER TABLE `acct_cust`
  ADD COLUMN IF NOT EXISTS `line_user_id` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `line_user_name` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `line_user_profile` TEXT NULL,
  ADD COLUMN IF NOT EXISTS `line_register_at` DATETIME NULL;

CREATE INDEX IF NOT EXISTS `idx_acct_cust_line_user_id` ON `acct_cust` (`line_user_id`);
