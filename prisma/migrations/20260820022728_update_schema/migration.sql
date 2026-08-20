-- DropForeignKey
ALTER TABLE "Inventories" DROP CONSTRAINT "Inventories_variantId_fkey";

-- AddForeignKey
ALTER TABLE "Inventories" ADD CONSTRAINT "Inventories_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Product_Variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
