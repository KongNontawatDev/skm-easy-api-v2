-- โดเมนที่ตัดออก: RBAC, อีคอมเมิร์ซ, อัปโหลด, webhook ลงทะเบียน, idempotency record
-- เพิ่ม isStaff บน User แทน role staff/admin

ALTER TABLE `User` ADD COLUMN `isStaff` BOOLEAN NOT NULL DEFAULT false;

UPDATE `User` u
INNER JOIN `UserRole` ur ON ur.`userId` = u.`id`
INNER JOIN `Role` r ON r.`id` = ur.`roleId` AND r.`slug` IN ('admin', 'staff')
SET u.`isStaff` = true;

DROP TABLE IF EXISTS `WebhookDelivery`;
DROP TABLE IF EXISTS `WebhookEndpoint`;
DROP TABLE IF EXISTS `Payment`;
DROP TABLE IF EXISTS `OrderItem`;
DROP TABLE IF EXISTS `Order`;
DROP TABLE IF EXISTS `CartItem`;
DROP TABLE IF EXISTS `Cart`;
DROP TABLE IF EXISTS `FileUpload`;
DROP TABLE IF EXISTS `Notification`;
DROP TABLE IF EXISTS `IdempotencyRecord`;
DROP TABLE IF EXISTS `UserRole`;
DROP TABLE IF EXISTS `RolePermission`;
DROP TABLE IF EXISTS `Role`;
DROP TABLE IF EXISTS `Permission`;
DROP TABLE IF EXISTS `Product`;

ALTER TABLE `Category` DROP FOREIGN KEY `Category_parentId_fkey`;
DROP TABLE IF EXISTS `Category`;
