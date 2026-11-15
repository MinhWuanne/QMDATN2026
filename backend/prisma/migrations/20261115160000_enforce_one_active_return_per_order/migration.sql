-- Enforce the business rule that one original order can have
-- at most one non-terminal ReturnRequest at any point in time.
-- Completed, rejected and cancelled requests release the order lock.
CREATE UNIQUE INDEX "return_requests_one_active_per_order_key"
ON "return_requests" ("order_id")
WHERE "status" NOT IN ('COMPLETED', 'REJECTED', 'CANCELLED');
