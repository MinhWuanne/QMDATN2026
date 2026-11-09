-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkout_started_at" TIMESTAMPTZ(6),
ADD COLUMN     "expires_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "payments_status_expires_idx" ON "payments"("status", "expires_at");
