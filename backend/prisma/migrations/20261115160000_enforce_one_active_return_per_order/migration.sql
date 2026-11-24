-- Multiple independent return requests are allowed
-- for different OrderItems in the same original order.
--
-- Each OrderItem remains permanently locked by
-- return_items_order_item_id_key.

DROP INDEX IF EXISTS "return_requests_one_active_per_order_key";