-- ลูกค้าแอปอ้างอิงด้วยรหัสจาก `acct_cust` (คอลัมน์ `idno`) แทนชื่อ `user_id`
DROP INDEX `notifications_user_id_is_read_idx` ON `notifications`;
ALTER TABLE `notifications` CHANGE COLUMN `user_id` `idno` VARCHAR(255) NOT NULL;
CREATE INDEX `notifications_idno_is_read_idx` ON `notifications` (`idno`, `is_read`);

DROP INDEX `support_tickets_user_id_status_idx` ON `support_tickets`;
ALTER TABLE `support_tickets` CHANGE COLUMN `user_id` `idno` VARCHAR(255) NOT NULL;
CREATE INDEX `support_tickets_idno_status_idx` ON `support_tickets` (`idno`, `status`);
