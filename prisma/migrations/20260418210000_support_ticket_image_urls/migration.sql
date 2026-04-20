-- รูปประกอบการแจ้งปัญหา (เก็บเป็น JSON array ของ URL ภายใต้ /api/v1/public/files/...)
ALTER TABLE `support_tickets` ADD COLUMN `image_urls` JSON NULL;
