
-- ==========================================
-- 1. ENUMS
-- ==========================================

ALTER TYPE "payment_method"
ADD VALUE 'INTERNAL_EXCHANGE';

ALTER TYPE "payment_status"
ADD VALUE 'NOT_REQUIRED';

ALTER TYPE "return_status"
ADD VALUE 'REFUND_PENDING';

ALTER TYPE "return_status"
ADD VALUE 'WAITING_FOR_STOCK';

CREATE TYPE "return_item_status" AS ENUM (
    'PENDING',
    'REJECTED',
    'REFUND_PENDING',
    'WAITING_FOR_STOCK',
    'COMPLETED'
);

CREATE TYPE "member_profile_request_status" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED'
);

-- ==========================================
-- 2. ORDER
-- ==========================================

ALTER TABLE "orders"
ADD COLUMN "delivered_at" TIMESTAMPTZ(6);

-- Backfill from actual DELIVERED history.
UPDATE "orders" AS o
SET "delivered_at" = h."delivered_at"
FROM (
    SELECT
        "order_id",
        MIN("created_at") AS "delivered_at"
    FROM "order_status_histories"
    WHERE "new_status" = 'DELIVERED'
    GROUP BY "order_id"
) AS h
WHERE o."id" = h."order_id";

-- ==========================================
-- 3. ORDER ITEM DISCOUNT
-- ==========================================

ALTER TABLE "order_items"
ADD COLUMN "discount_amount" DECIMAL(14,2)
NOT NULL DEFAULT 0;

-- Validate that discount does not exceed
-- the total value of the order items.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "orders" o
        LEFT JOIN (
            SELECT
                "order_id",
                SUM("line_total") AS item_total
            FROM "order_items"
            GROUP BY "order_id"
        ) t ON t."order_id" = o."id"
        WHERE o."discount_amount" < 0
           OR o."discount_amount" > COALESCE(t.item_total, 0)
    ) THEN
        RAISE EXCEPTION
            'Invalid order discount: discount exceeds item total';
    END IF;
END $$;

-- Largest Remainder allocation:
-- 1. Calculate exact discount cents per item.
-- 2. Assign the floor amount.
-- 3. Distribute remaining cents by largest fractional remainder.
-- 4. Use item ID as deterministic tie-breaker.

WITH item_totals AS (
    SELECT
        "order_id",
        SUM("line_total") AS total
    FROM "order_items"
    GROUP BY "order_id"
),
raw_allocations AS (
    SELECT
        oi."id",
        oi."order_id",
        ROUND(o."discount_amount" * 100)::BIGINT AS discount_cents,
        (
            ROUND(o."discount_amount" * 100)::NUMERIC
            * oi."line_total"
            / NULLIF(t.total, 0)
        ) AS exact_cents
    FROM "order_items" oi
    JOIN "orders" o
        ON o."id" = oi."order_id"
    JOIN item_totals t
        ON t."order_id" = oi."order_id"
),
floored AS (
    SELECT
        "id",
        "order_id",
        discount_cents,
        FLOOR(COALESCE(exact_cents, 0))::BIGINT AS base_cents,
        COALESCE(exact_cents, 0)
            - FLOOR(COALESCE(exact_cents, 0)) AS remainder
    FROM raw_allocations
),

ranked AS (
    SELECT
        f.*,
        ROW_NUMBER() OVER (
            PARTITION BY f.order_id
            ORDER BY f.remainder DESC, f.id ASC
        ) AS allocation_rank,
        SUM(f.base_cents) OVER (
            PARTITION BY f.order_id
        ) AS allocated_cents
    FROM floored f
),
final_allocations AS (
    SELECT
        id,
        base_cents +
        CASE
            WHEN allocation_rank <= discount_cents - allocated_cents
            THEN 1
            ELSE 0
        END AS final_cents
    FROM ranked
)

UPDATE "order_items" oi
SET "discount_amount" = f.final_cents::NUMERIC / 100
FROM final_allocations f
WHERE oi."id" = f."id";

-- ==========================================
-- 4. RETURN REQUEST
-- ==========================================

ALTER TABLE "return_requests"
ADD COLUMN "received_at" TIMESTAMPTZ(6),
ADD COLUMN "inspected_at" TIMESTAMPTZ(6),
ADD COLUMN "processed_by_id" UUID,
ADD COLUMN "replacement_order_id" UUID;

ALTER TABLE "return_requests"
ADD CONSTRAINT "return_requests_processed_by_id_fkey"
FOREIGN KEY ("processed_by_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "return_requests"
ADD CONSTRAINT "return_requests_replacement_order_id_fkey"
FOREIGN KEY ("replacement_order_id")
REFERENCES "orders"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE UNIQUE INDEX
"return_requests_replacement_order_id_key"
ON "return_requests"("replacement_order_id");

-- ==========================================
-- 5. RETURN ITEM
-- ==========================================

ALTER TABLE "return_items"
ADD COLUMN "status" "return_item_status"
NOT NULL DEFAULT 'PENDING',
ADD COLUMN "rejection_reason" TEXT;

-- Replace non-unique index with unique index.
DROP INDEX IF EXISTS "return_items_order_item_id_idx";

CREATE UNIQUE INDEX
"return_items_order_item_id_key"
ON "return_items"("order_item_id");

-- ==========================================
-- 6. MEMBER PROFILE REQUEST
-- ==========================================

CREATE TABLE "member_profile_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    "requested_full_name" VARCHAR(150),
    "requested_phone" VARCHAR(20),

    "status" "member_profile_request_status"
        NOT NULL DEFAULT 'REQUESTED',

    "admin_note" TEXT,

    "processed_by_id" UUID,
    "processed_at" TIMESTAMPTZ(6),

    "created_at" TIMESTAMPTZ(6)
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "updated_at" TIMESTAMPTZ(6)
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_profile_requests_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "member_profile_requests_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT "member_profile_requests_processed_by_id_fkey"
        FOREIGN KEY ("processed_by_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "member_profile_requests_has_requested_field_check"
        CHECK (
            "requested_full_name" IS NOT NULL
            OR "requested_phone" IS NOT NULL
        )
);

CREATE INDEX "member_profile_requests_user_created_idx"
ON "member_profile_requests"("user_id", "created_at" DESC);

CREATE INDEX "member_profile_requests_status_created_idx"
ON "member_profile_requests"("status", "created_at" DESC);

-- Only one REQUESTED profile change per user.
-- Historical APPROVED/REJECTED requests remain unrestricted.
CREATE UNIQUE INDEX
"member_profile_requests_one_requested_per_user_key"
ON "member_profile_requests"("user_id")
WHERE "status" = 'REQUESTED';
