-- พารามิเตอร์: ? = legacy_customer_id
SELECT `line_user_id` AS line_user_id FROM `customer_liff_links` WHERE `legacy_customer_id` = ? ORDER BY `created_at` DESC LIMIT 1
