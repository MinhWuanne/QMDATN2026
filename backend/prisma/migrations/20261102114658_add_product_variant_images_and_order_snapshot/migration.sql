-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variant_attributes" JSONB;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "is_primary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_id" VARCHAR(255),
ADD COLUMN     "variant_id" UUID;

-- CreateIndex
CREATE INDEX "product_images_variant_sort_idx" ON "product_images"("variant_id", "sort_order");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
