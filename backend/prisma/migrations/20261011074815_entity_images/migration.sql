-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "imagePath" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "imagePath" TEXT;

-- CreateTable
CREATE TABLE "catalog_item_images" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_item_images_catalogItemId_idx" ON "catalog_item_images"("catalogItemId");

-- AddForeignKey
ALTER TABLE "catalog_item_images" ADD CONSTRAINT "catalog_item_images_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
