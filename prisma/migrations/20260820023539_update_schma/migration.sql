-- DropForeignKey
ALTER TABLE "InventoryTransactions" DROP CONSTRAINT "InventoryTransactions_inventoryId_fkey";

-- AddForeignKey
ALTER TABLE "InventoryTransactions" ADD CONSTRAINT "InventoryTransactions_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
