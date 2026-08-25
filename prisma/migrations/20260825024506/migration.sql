-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Inventories" DROP CONSTRAINT "Inventories_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransactions" DROP CONSTRAINT "InventoryTransactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";

-- AddForeignKey
ALTER TABLE "Inventories" ADD CONSTRAINT "Inventories_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransactions" ADD CONSTRAINT "InventoryTransactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Product_Variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Product_Variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
