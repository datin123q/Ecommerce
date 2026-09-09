-- AlterTable
ALTER TABLE "InventoryTransactions" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ScheduledJobLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "recordsAffected" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJobLog_pkey" PRIMARY KEY ("id")
);
