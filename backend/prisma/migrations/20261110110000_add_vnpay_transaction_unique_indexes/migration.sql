-- Replace the existing Payment index with a unique index.
DROP INDEX "payments_provider_txn_idx";

CREATE UNIQUE INDEX "payments_provider_txn_idx"
ON "payments" ("provider_txn_id");

-- Ensure each VNPAY transaction ID has only one IPN event.
CREATE UNIQUE INDEX "payment_transactions_ipn_provider_txn_unique"
ON "payment_transactions" ("provider_txn_id")
WHERE "type" = 'IPN'
  AND "provider_txn_id" IS NOT NULL;