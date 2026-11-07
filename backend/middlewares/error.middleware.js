
const ERROR_STATUS_MAP = {
    VALIDATION_ERROR: 400,

    EMAIL_ALREADY_EXISTS: 409,
    PHONE_ALREADY_EXISTS: 409,
    REGISTRATION_CONFLICT: 409,

    REGISTRATION_EMAIL_DELIVERY_FAILED: 503,
    OTP_EMAIL_DELIVERY_FAILED: 503,

    OTP_INVALID_OR_UNAVAILABLE: 400,
    OTP_INVALID: 400,
    OTP_EXPIRED: 400,
    OTP_MAX_ATTEMPTS_EXCEEDED: 429,
    OTP_RESEND_TOO_SOON: 429,
    OTP_SEND_LIMIT_EXCEEDED: 429,
    USER_NOT_FOUND: 404,
    USER_NOT_ELIGIBLE_FOR_VERIFICATION: 409,
    ACCOUNT_NOT_FOUND: 404,

    INVALID_CREDENTIALS: 401,
    MISSING_REFRESH_TOKEN: 401,
    INVALID_REFRESH_TOKEN: 401,
    REFRESH_TOKEN_EXPIRED: 401,
    REFRESH_TOKEN_REUSE_DETECTED: 401,

    EMAIL_NOT_VERIFIED: 403,
    ACCOUNT_LOCKED: 403,
    ACCOUNT_NOT_ACTIVE: 403,
    INVALID_USER_ROLE: 403,

    INVALID_OR_EXPIRED_RESET_TOKEN: 400,


    CATEGORY_NOT_FOUND: 404,
    BRAND_NOT_FOUND: 404,
    CATEGORY_SLUG_EXISTS: 409,
    BRAND_SLUG_EXISTS: 409,
    CATEGORY_CONFLICT: 409,
    BRAND_CONFLICT: 409,
    CATEGORY_IN_USE: 409,
    BRAND_IN_USE: 409,

    PRODUCT_NOT_FOUND: 404,
    PRODUCT_VARIANT_NOT_FOUND: 404,

    PRODUCT_SLUG_EXISTS: 409,
    PRODUCT_SKU_EXISTS: 409,
    PRODUCT_CONFLICT: 409,

    PRODUCT_ARCHIVED: 409,
    PRODUCT_ALREADY_ARCHIVED: 409,
    PRODUCT_NO_ACTIVE_VARIANTS: 409,
    PRODUCT_LAST_ACTIVE_VARIANT: 409,

    PRODUCT_VARIANT_ALREADY_INACTIVE: 409,

    CATEGORY_INACTIVE: 409,
    BRAND_INACTIVE: 409,

    PRODUCT_VARIANT_INACTIVE: 409,
};

function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode =
        err.statusCode ||
        ERROR_STATUS_MAP[err.message] ||
        500;

    const isOperationalError =
        Object.prototype.hasOwnProperty.call(
            ERROR_STATUS_MAP,
            err.message
        );

    if (statusCode >= 500) {
        console.error("Server error:", err);
    }

    const response = {
        success: false,
        message: isOperationalError
            ? err.message
            : "INTERNAL_SERVER_ERROR",
    };

    if (
        err.message === "VALIDATION_ERROR" &&
        err.details
    ) {
        response.details = err.details;
    }

    return res.status(statusCode).json(response);
}

module.exports = errorHandler;
