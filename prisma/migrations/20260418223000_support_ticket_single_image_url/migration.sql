-- รูปประกอบตั๋วแจ้งปัญหา: เก็บ URL เดียวต่อตั๋ว (แทน JSON array)
ALTER TABLE `support_tickets` ADD COLUMN `image_url` VARCHAR(2048) NULL;

UPDATE `support_tickets`
SET `image_url` = JSON_UNQUOTE(JSON_EXTRACT(`image_urls`, '$[0]'))
WHERE `image_urls` IS NOT NULL
  AND JSON_TYPE(JSON_EXTRACT(`image_urls`, '$[0]')) = 'STRING';

ALTER TABLE `support_tickets` DROP COLUMN `image_urls`;
