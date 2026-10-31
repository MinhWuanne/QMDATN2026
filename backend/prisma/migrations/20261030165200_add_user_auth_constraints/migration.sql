-- 1. Only one ADMIN account
CREATE UNIQUE INDEX "users_only_one_admin_idx"
ON "users" ("role")
WHERE "role" = 'ADMIN';

-- 2. Normalize email
ALTER TABLE "users"
ADD CONSTRAINT "users_email_normalized_check"
CHECK (
    "email" = LOWER(BTRIM("email"))
    AND LENGTH(BTRIM("email")) > 0
);

-- 3. Validate phone
ALTER TABLE "users"
ADD CONSTRAINT "users_phone_not_blank_check"
CHECK (
    "phone" IS NULL
    OR ("phone" = BTRIM("phone") AND "phone" <> '')
);

-- 4. Validate role and account status
ALTER TABLE "users"
ADD CONSTRAINT "users_role_status_check"
CHECK (
    (
        "role" = 'ADMIN'
        AND "status" = 'ACTIVE'
    )
    OR
    (
        "role" = 'CUSTOMER'
        AND (
            (
                "status" = 'PENDING_VERIFICATION'
                AND "email_verified_at" IS NULL
            )
            OR
            (
                "status" IN ('ACTIVE', 'LOCKED')
                AND "email_verified_at" IS NOT NULL
            )
        )
    )
);

-- 5. Only one default address per user
CREATE UNIQUE INDEX "addresses_one_default_per_user_idx"
ON "addresses" ("user_id")
WHERE "is_default" = TRUE;

-- 6. Validate address fields
ALTER TABLE "addresses"
ADD CONSTRAINT "addresses_required_fields_check"
CHECK (
    LENGTH(BTRIM("recipient_name")) > 0
    AND LENGTH(BTRIM("phone")) > 0
    AND LENGTH(BTRIM("province_city")) > 0
    AND LENGTH(BTRIM("district")) > 0
    AND LENGTH(BTRIM("street")) > 0
);

-- 7. Only one active email verification per user and purpose
CREATE UNIQUE INDEX "email_verifications_one_active_idx"
ON "email_verifications" ("user_id", "purpose")
WHERE "used_at" IS NULL
AND "invalidated_at" IS NULL;

-- 8. OTP attempt count
ALTER TABLE "email_verifications"
ADD CONSTRAINT "email_verifications_attempt_count_check"
CHECK ("attempt_count" BETWEEN 0 AND 5);

-- 9. Validate status history
ALTER TABLE "user_status_histories"
ADD CONSTRAINT "user_status_histories_transition_check"
CHECK (
    "old_status" IN ('ACTIVE', 'LOCKED')
    AND "new_status" IN ('ACTIVE', 'LOCKED')
    AND "old_status" <> "new_status"
    AND LENGTH(BTRIM("reason")) > 0
);