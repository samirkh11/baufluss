-- CreateEnum
CREATE TYPE "DunningLevel" AS ENUM ('REMINDER', 'FIRST', 'SECOND', 'FINAL');

-- AlterTable
ALTER TABLE "invoice_details" ADD COLUMN     "dunningBlockReason" TEXT,
ADD COLUMN     "dunningBlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dunning_settings" (
    "companyId" TEXT NOT NULL,
    "reminderAfterDays" INTEGER NOT NULL DEFAULT 3,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "feeFirst" DECIMAL(8,2) NOT NULL DEFAULT 5,
    "feeSecond" DECIMAL(8,2) NOT NULL DEFAULT 10,
    "feeFinal" DECIMAL(8,2) NOT NULL DEFAULT 15,
    "interestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "baseRatePercent" DECIMAL(6,3) NOT NULL DEFAULT 1.27,
    "lumpSumB2B" DECIMAL(8,2) NOT NULL DEFAULT 40,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_settings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "dunnings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" TEXT,
    "level" "DunningLevel" NOT NULL,
    "dunningDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "openAmount" DECIMAL(14,2) NOT NULL,
    "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "interestDays" INTEGER NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lumpSumAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "issuerSnapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dunnings_documentId_idx" ON "dunnings"("documentId");

-- CreateIndex
CREATE INDEX "dunnings_companyId_dunningDate_idx" ON "dunnings"("companyId", "dunningDate");

-- AddForeignKey
ALTER TABLE "dunning_settings" ADD CONSTRAINT "dunning_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunnings" ADD CONSTRAINT "dunnings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunnings" ADD CONSTRAINT "dunnings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
