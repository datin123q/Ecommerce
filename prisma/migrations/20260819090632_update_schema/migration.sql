/*
  Warnings:

  - Added the required column `entity` to the `Audits_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityId` to the `Audits_log` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `action` on the `Audits_log` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'DELETE', 'UPDATE');

-- AlterTable
ALTER TABLE "Audits_log" ADD COLUMN     "entity" TEXT NOT NULL,
ADD COLUMN     "entityId" TEXT NOT NULL,
ADD COLUMN     "newValues" JSONB,
ADD COLUMN     "oldValues" JSONB,
DROP COLUMN "action",
ADD COLUMN     "action" "AuditAction" NOT NULL;
