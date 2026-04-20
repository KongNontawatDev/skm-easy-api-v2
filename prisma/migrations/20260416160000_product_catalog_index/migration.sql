-- CreateIndex
CREATE INDEX `Product_deletedAt_categoryId_createdAt_idx` ON `Product`(`deletedAt`, `categoryId`, `createdAt`);
