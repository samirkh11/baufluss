-- CreateEnum
CREATE TYPE "IncomingInvoiceStatus" AS ENUM ('RECEIVED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "IncomingInvoiceSource" AS ENUM ('UPLOAD', 'EMAIL', 'MANUAL');

-- CreateTable
CREATE TABLE "IncomingInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "serviceDate" DATE,
    "dueDate" DATE,
    "description" TEXT,
    "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "status" "IncomingInvoiceStatus" NOT NULL DEFAULT 'RECEIVED',
    "source" "IncomingInvoiceSource" NOT NULL DEFAULT 'UPLOAD',
    "rejectionReason" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "fileHash" TEXT,
    "uploadedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingInvoice_companyId_status_idx" ON "IncomingInvoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "IncomingInvoice_projectId_idx" ON "IncomingInvoice"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingInvoice_companyId_number_key" ON "IncomingInvoice"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingInvoice_companyId_fileHash_key" ON "IncomingInvoice"("companyId", "fileHash");

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
