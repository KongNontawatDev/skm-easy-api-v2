-- ผูก LINE LIFF กับลูกค้า legacy (ตรงกับ model CustomerLiffLink ใน schema.prisma)

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
