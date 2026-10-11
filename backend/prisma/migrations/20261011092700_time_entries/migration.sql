-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'APPROVED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hourlyRate" DECIMAL(8,2);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" DATE NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "activity" TEXT,
    "note" TEXT,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_companyId_date_idx" ON "time_entries"("companyId", "date");

-- CreateIndex
CREATE INDEX "time_entries_userId_date_idx" ON "time_entries"("userId", "date");

-- CreateIndex
CREATE INDEX "time_entries_projectId_idx" ON "time_entries"("projectId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
