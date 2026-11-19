-- Each manual refund reference can only be used once.
CREATE UNIQUE INDEX "payment_transactions_refund_provider_txn_unique"
ON "payment_transactions" ("provider_txn_id")
WHERE "type" = 'REFUND'
  AND "provider_txn_id" IS NOT NULL;