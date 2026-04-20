-- =============================================================================
-- SKM Easy API v2 — SQL ส่งให้ DBA รันแทน user ที่ไม่มีสิทธิ์ DDL
-- =============================================================================
-- แบ่งเป็นเป้าหมายหลัก (อาจเป็นคนละ instance / คนละฐานข้อมูล):
--   A) (ไม่ใช้แล้ว) เดิมเพิ่มคอลัมน์ LINE บน `acct_cust` — แอปอ่าน/เขียน LINE ผ่าน `customer_liff_links` (บล็อก F) เท่านั้น
--   B) ฐานข้อมูลหลักของ API (ที่ Prisma ชี้) — ตารางแอปลูกค้า/CMS (ไม่มีตารางคำขอแจ้งโอน)
--      ถ้าฐาน B สร้างมาก่อนแล้วและคอลัมน์เนื้อหายังเป็น TEXT — รัน `sql/dba/alter_cms_content_longtext.sql`
--      เพื่อยกเป็น LONGTEXT (ไม่ผ่าน prisma migrate)
--   E) ฐานเดียวกับ B — ตาราง Better Auth สำหรับแอดมิน back-office (แยกจากตาราง `User` เดิม)
--   F) ฐานเดียวกับ B — ตาราง `customer_liff_links` ผูก LINE LIFF กับลูกค้า legacy (migration 20260418160000)
--   G) อัปเกรดอย่างเดียว — ถ้า `notifications` / `support_tickets` ยังใช้คอลัมน์ `user_id` จาก migration เก่า
--      ให้รันบล็อก G (เทียบเท่า migration 20260418150000) — ถ้าสร้างจากบล็อก B ในไฟล์นี้ที่ใช้ `idno` อยู่แล้ว ให้ข้าม
--   H) อัปเกรดอย่างเดียว — `support_tickets.image_url` (รูปประกอบตั๋วแจ้งปัญหา 1 รูปต่อตั๋ว) — บล็อก H ด้านล่าง
--      (เทียบเท่า migration 20260418223000_support_ticket_single_image_url; ถ้ายังไม่มี image_urls จาก 20260418210000 ให้รันเฉพาะส่วน ADD image_url)
--
-- หมายเหตุ Prisma:
--   ถ้า DBA สร้างตารางด้วยสคริปต์นี้แล้ว ทีม dev ต้อง “baseline” migration
--   (เช่น `prisma migrate resolve --applied <ชื่อ migration>` ตามลำดับ)
--   หรือให้ DBA รัน `npx prisma migrate deploy` บนเครื่องที่มีสิทธิ์แทน — จะตรงกับ _prisma_migrations อัตโนมัติ
--
-- เวอร์ชัน MariaDB/MySQL:
--   ADD COLUMN IF NOT EXISTS — MariaDB 10.3+ / MySQL 8.0.29+
--   ถ้าเวอร์ชันต่ำกว่า ให้ลบ IF NOT EXISTS แล้วรันทีละคอลัมน์ (หรือรับ error คอลัมน์ซ้ำ)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) ข้าม — ไม่เพิ่มคอลัมน์ LINE บน `acct_cust`
--     การผูก LINE LIFF เก็บในตาราง `customer_liff_links` (บล็อก F) บนฐาน API
--     ตั้งค่า env: `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` ชี้ไป `customer_liff_links` และ
--     `LEGACY_LINE_LINK_UPDATE_SQL` ว่างได้ (หรือไม่ตั้ง) — `linkLineProfile()` จะไม่รัน legacy UPDATE
-- -----------------------------------------------------------------------------
-- A') ถ้าเคยรันสคริปต์เก่าที่เพิ่มคอลัมน์ LINE บน `acct_cust` แล้ว และต้องการถอนออก (รันเฉพาะเมื่อมีคอลัมน์/index จริง)
--     ลำดับ: DROP INDEX ก่อน (ถ้ามี) แล้วค่อย DROP COLUMN
-- -----------------------------------------------------------------------------
-- ALTER TABLE `acct_cust` DROP INDEX `idx_acct_cust_line_user_id`;
-- ALTER TABLE `acct_cust`
--   DROP COLUMN `line_user_id`,
--   DROP COLUMN `line_user_name`,
--   DROP COLUMN `line_user_profile`,
--   DROP COLUMN `line_register_at`;

-- -----------------------------------------------------------------------------
-- B) ฐาน API — ตารางโดเมนผ่อน/แอปลูกค้า (รันบนฐานที่แอปใช้จริง)
--     คอลัมน์ otp_code = VARCHAR(191) เก็บ bcrypt ของรหัส SMS 4 หลัก (ตรงกับ migration 20260417184500)
--     ⚠️ ถ้าตารางมีอยู่แล้วจาก prisma migrate อย่ารันบล็อกนี้ซ้ำ
-- -----------------------------------------------------------------------------

CREATE TABLE `otp_verifications` (
    `id` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(16) NOT NULL,
    `otp_code` VARCHAR(10) NOT NULL,
    `ref_code` VARCHAR(10) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `otp_verifications_phone_ref_code_idx`(`phone`, `ref_code`),
    INDEX `otp_verifications_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
    `id` VARCHAR(255) NOT NULL,
    `idno` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_idno_is_read_idx`(`idno`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `promotions` (
    `id` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `image` VARCHAR(255) NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `promotions_is_active_start_date_end_date_idx`(`is_active`, `start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `articles` (
    `id` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `cover_image` VARCHAR(2048) NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `articles_published_at_idx`(`published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_tickets` (
    `id` VARCHAR(255) NOT NULL,
    `idno` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `status` VARCHAR(255) NOT NULL,
    `admin_reply` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `support_tickets_idno_status_idx`(`idno`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_guides` (
    `id` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `app_guides_sort_order_idx`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- E) ฐาน API — Better Auth แอดมิน (รันบนฐานเดียวกับ B)
--     สอดคล้องกับ Prisma migration 20260418140000_admin_better_auth_tables
--     แอป mount handler ที่ `/api/v1/admin-auth/*` และตั้ง `BETTER_AUTH_URL` = origin ของ API
--     ⚠️ ถ้า prisma migrate สร้างตารางนี้แล้ว อย่ารันบล็อกนี้ซ้ำ
-- -----------------------------------------------------------------------------

CREATE TABLE `admin_auth_user` (
    `id` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_auth_user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_auth_session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` TEXT NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `admin_auth_session_token_key`(`token`),
    INDEX `admin_auth_session_userId_idx`(`userId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `admin_auth_session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `admin_auth_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_auth_account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` TEXT NOT NULL,
    `providerId` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `admin_auth_account_userId_idx`(`userId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `admin_auth_account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `admin_auth_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_auth_verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` TEXT NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `admin_auth_verification_identifier_idx`(`identifier`(191)),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- C) อัปเกรดอย่างเดียว — ใช้เมื่อมีตารางจาก migration เก่าแล้ว (otp_code ยาว 32)
--     รันเฉพาะเมื่อ B) เคยถูกสร้างด้วยสคีมาเก่า แล้วยังไม่ได้รัน migration 20260417184500
-- -----------------------------------------------------------------------------

-- ALTER TABLE `otp_verifications` MODIFY `otp_code` VARCHAR(191) NOT NULL;

-- -----------------------------------------------------------------------------
-- D) ลบตารางคำขอแจ้งโอนในแอป (ถ้ายังมีจาก migration เก่า — Prisma migration 20260418120000 ทำให้อยู่แล้ว)
-- -----------------------------------------------------------------------------

-- DROP TABLE IF EXISTS `installment_payment_claims`;


-- -----------------------------------------------------------------------------
-- F) ฐาน API — ตารางผูก LINE LIFF ↔ ลูกค้า legacy
--     สอดคล้อง Prisma migration 20260418160000_customer_liff_links
--     รันบนฐานเดียวกับ B — ลูกค้าแอปใช้ POST /api/v1/auth/customer/liff/bootstrap
--     ดึง `line_user_id` สำหรับแจ้งเตือน LINE: ตั้ง `LEGACY_GET_LINE_USER_BY_CUSTOMER_SQL` ให้ SELECT จากตารางนี้ (`legacy_customer_id` = ?)
--     ⚠️ ถ้าตารางมีอยู่แล้วจาก prisma migrate อย่ารันซ้ำ
-- -----------------------------------------------------------------------------

CREATE TABLE `customer_liff_links` (
    `id` VARCHAR(191) NOT NULL,
    `legacy_customer_id` VARCHAR(255) NOT NULL,
    `line_user_id` VARCHAR(255) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `line_display_name` VARCHAR(255) NULL,
    `line_picture_url` VARCHAR(2000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customer_liff_links_line_user_id_key`(`line_user_id`),
    INDEX `customer_liff_links_legacy_customer_id_idx`(`legacy_customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- G) อัปเกรดอย่างเดียว — `notifications` / `support_tickets` เปลี่ยนคอลัมน์ `user_id` → `idno`
--     สอดคล้อง Prisma migration 20260418150000_notifications_support_idno
--     รันเฉพาะเมื่อตารางถูกสร้างจาก migration เก่าที่ยังใช้ชื่อคอลัมน์ `user_id`
--     ถ้าสร้างจากบล็อก B ในไฟล์นี้ (ใช้ `idno` อยู่แล้ว) หรือรัน prisma migrate deploy ครบแล้ว — ข้ามบล็อกนี้
-- -----------------------------------------------------------------------------

-- DROP INDEX `notifications_user_id_is_read_idx` ON `notifications`;
-- ALTER TABLE `notifications` CHANGE COLUMN `user_id` `idno` VARCHAR(255) NOT NULL;
-- CREATE INDEX `notifications_idno_is_read_idx` ON `notifications` (`idno`, `is_read`);

-- DROP INDEX `support_tickets_user_id_status_idx` ON `support_tickets`;
-- ALTER TABLE `support_tickets` CHANGE COLUMN `user_id` `idno` VARCHAR(255) NOT NULL;
-- CREATE INDEX `support_tickets_idno_status_idx` ON `support_tickets` (`idno`, `status`);


-- -----------------------------------------------------------------------------
-- H) อัปเกรดอย่างเดียว — `support_tickets.image_url` (รูปประกอบการแจ้งปัญหา 1 รูปต่อตั๋ว)
--     สอดคล้อง Prisma migration 20260418223000_support_ticket_single_image_url
--     ถ้ามีคอลัมน์ `image_urls` (JSON) จาก migration 20260418210000 — สคริปต์นี้ย้าย URL แรกไป `image_url` แล้วลบ `image_urls`
--     ลูกค้าแอป: POST `/api/v1/me/support/tickets/:id/image` (multipart ฟิลด์ `file`) ได้ 1 รูป (อัปโหลดซ้ำแทนที่); ตั๋ว `closed` ไม่รับรูป
--     ⚠️ ถ้า prisma migrate deploy รันแล้ว — ข้ามบล็อกนี้
-- -----------------------------------------------------------------------------

ALTER TABLE `support_tickets` ADD COLUMN IF NOT EXISTS `image_url` VARCHAR(2048) NULL;

UPDATE `support_tickets`
SET `image_url` = JSON_UNQUOTE(JSON_EXTRACT(`image_urls`, '$[0]'))
WHERE `image_urls` IS NOT NULL
  AND JSON_TYPE(JSON_EXTRACT(`image_urls`, '$[0]')) = 'STRING';

ALTER TABLE `support_tickets` DROP COLUMN `image_urls`;
