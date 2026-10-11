-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'PARTIAL', 'FINAL');

-- AlterTable
ALTER TABLE "document_items" ADD COLUMN     "deductsDocumentId" TEXT;

-- AlterTable
ALTER TABLE "invoice_details" ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "partialNumber" INTEGER,
ADD COLUMN     "retentionAmount" DECIMAL(14,2),
ADD COLUMN     "retentionDueDate" DATE,
ADD COLUMN     "retentionPercent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "document_items" ADD CONSTRAINT "document_items_deductsDocumentId_fkey" FOREIGN KEY ("deductsDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
