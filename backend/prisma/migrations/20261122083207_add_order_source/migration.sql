-- CreateEnum
CREATE TYPE "order_source" AS ENUM ('CART', 'BUY_NOW');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "source" "order_source" NOT NULL DEFAULT 'CART';
