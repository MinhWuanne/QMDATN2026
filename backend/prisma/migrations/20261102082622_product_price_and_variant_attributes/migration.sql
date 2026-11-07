/*
  Warnings:

  - You are about to drop the column `compare_at_price` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `product_variants` table. All the data in the column will be lost.
  - Added the required column `price` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "compare_at_price",
DROP COLUMN "price",
ADD COLUMN     "attributes" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "price" DECIMAL(14,2) NOT NULL;
