/*
  Warnings:

  - A unique constraint covering the columns `[voucherId,orderId]` on the table `VoucherUsages` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "Audits_log_userId_idx" ON "Audits_log"("userId");

-- CreateIndex
CREATE INDEX "Audits_log_entityId_entity_idx" ON "Audits_log"("entityId", "entity");

-- CreateIndex
CREATE INDEX "Inventories_variantId_quantity_idx" ON "Inventories"("variantId", "quantity" DESC);

-- CreateIndex
CREATE INDEX "Notifications_userId_createdAt_idx" ON "Notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderItems_orderId_idx" ON "OrderItems"("orderId");

-- CreateIndex
CREATE INDEX "OrderItems_variantId_idx" ON "OrderItems"("variantId");

-- CreateIndex
CREATE INDEX "Orders_userId_createdAt_idx" ON "Orders"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_Variants_productId_idx" ON "Product_Variants"("productId");

-- CreateIndex
CREATE INDEX "Products_categoryId_idx" ON "Products"("categoryId");

-- CreateIndex
CREATE INDEX "VoucherUsages_userId_idx" ON "VoucherUsages"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherUsages_voucherId_orderId_key" ON "VoucherUsages"("voucherId", "orderId");
