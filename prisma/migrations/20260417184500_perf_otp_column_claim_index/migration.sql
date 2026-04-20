-- ขยายคอลัมน์ OTP ให้รองรับ bcrypt hash; เพิ่มดัชนีค้นหาคำขอแจ้งโอนซ้ำตามลูกค้า/สัญญา/งวด/สถานะ

ALTER TABLE `otp_verifications` MODIFY `otp_code` VARCHAR(191) NOT NULL;

CREATE INDEX `installment_payment_claims_cus_contract_inst_status_idx`
  ON `installment_payment_claims` (`legacy_customer_id`, `contract_ref`, `installment_ref`, `status`);
