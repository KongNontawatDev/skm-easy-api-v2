-- =============================================================================
-- อัปเดตคอลัมน์เนื้อหาเป็น LONGTEXT (รองรับ HTML + รูป base64 จาก rich text)
-- -----------------------------------------------------------------------------
-- รันด้วยตนเองบน MariaDB/MySQL ของโปรเจกต์ (ไม่ผ่าน `prisma migrate`)
-- สอดคล้องกับ prisma/schema.prisma (@db.LongText)
-- =============================================================================

ALTER TABLE `app_guides` MODIFY `content` LONGTEXT NOT NULL;
ALTER TABLE `articles` MODIFY `content` LONGTEXT NOT NULL;
ALTER TABLE `promotions` MODIFY `description` LONGTEXT NOT NULL;

ALTER TABLE `support_tickets` MODIFY `description` LONGTEXT NOT NULL;
ALTER TABLE `support_tickets` MODIFY `admin_reply` LONGTEXT NULL;
ALTER TABLE `notifications` MODIFY `message` LONGTEXT NOT NULL;
