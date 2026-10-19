/*
  Warnings:

  - You are about to drop the `Categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product_Variants` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CartItems" DROP CONSTRAINT "CartItems_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Inventories" DROP CONSTRAINT "Inventories_variantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItems" DROP CONSTRAINT "OrderItems_variantId_fkey";

-- DropForeignKey
ALTER TABLE "Product_Variants" DROP CONSTRAINT "Product_Variants_productId_fkey";

-- DropForeignKey
ALTER TABLE "Products" DROP CONSTRAINT "Products_categoryId_fkey";

-- DropTable
DROP TABLE "Categories";

-- DropTable
DROP TABLE "Product_Variants";

-- DropTable
DROP TABLE "Products";
