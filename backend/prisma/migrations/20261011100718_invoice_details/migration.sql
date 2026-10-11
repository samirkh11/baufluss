-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "issuerSnapshot" JSONB;

-- CreateTable
CREATE TABLE "invoice_details" (
    "documentId" TEXT NOT NULL,
    "serviceDateFrom" DATE,
    "serviceDateTo" DATE,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "dueDate" DATE,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "recipientVatId" TEXT,
    "orderReference" TEXT,
    "buyerReference" TEXT,

    CONSTRAINT "invoice_details_pkey" PRIMARY KEY ("documentId")
);

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
