-- CreateEnum
CREATE TYPE "ArchiveKind" AS ENUM ('DOCUMENT_PDF', 'EINVOICE_XML', 'DUNNING_PDF');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ArchivedFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ArchiveKind" NOT NULL,
    "documentId" TEXT,
    "dunningId" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "retainUntil" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceSettings" (
    "companyId" TEXT NOT NULL,
    "responsiblePerson" TEXT,
    "hostingDescription" TEXT,
    "backupDescription" TEXT,
    "retentionYearsInvoices" INTEGER NOT NULL DEFAULT 8,
    "retentionYearsOther" INTEGER NOT NULL DEFAULT 6,
    "datevAdvisorNumber" INTEGER,
    "datevClientNumber" INTEGER,
    "accountRevenue19" INTEGER NOT NULL DEFAULT 8400,
    "accountRevenue7" INTEGER NOT NULL DEFAULT 8300,
    "accountRevenueExempt" INTEGER NOT NULL DEFAULT 8337,
    "accountExpense19" INTEGER NOT NULL DEFAULT 3400,
    "accountExpense7" INTEGER NOT NULL DEFAULT 3300,
    "accountExpenseNoVat" INTEGER NOT NULL DEFAULT 3200,
    "accountBank" INTEGER NOT NULL DEFAULT 1200,
    "accountDebtorBase" INTEGER NOT NULL DEFAULT 10000,
    "accountCreditorBase" INTEGER NOT NULL DEFAULT 70000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "ArchivedFile_companyId_documentId_idx" ON "ArchivedFile"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "ArchivedFile_companyId_kind_idx" ON "ArchivedFile"("companyId", "kind");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ArchivedFile" ADD CONSTRAINT "ArchivedFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedFile" ADD CONSTRAINT "ArchivedFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedFile" ADD CONSTRAINT "ArchivedFile_dunningId_fkey" FOREIGN KEY ("dunningId") REFERENCES "dunnings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSettings" ADD CONSTRAINT "ComplianceSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
