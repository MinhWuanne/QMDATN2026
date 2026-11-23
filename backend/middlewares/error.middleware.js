
const ERROR_STATUS_MAP = {

    CURRENT_PASSWORD_INVALID: 400,
    PASSWORD_CHANGE_CONFLICT: 409,
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

    // ==========================================
    // VOUCHERS
    // ==========================================

    VOUCHER_NOT_FOUND: 404,
    VOUCHER_INACTIVE: 409,
    VOUCHER_OUTSIDE_VALID_PERIOD: 409,
    VOUCHER_MIN_ORDER_AMOUNT_NOT_MET: 400,
    VOUCHER_USAGE_LIMIT_REACHED: 409,
    VOUCHER_USER_LIMIT_REACHED: 409,

    VOUCHER_CODE_EXISTS: 409,
    VOUCHER_CONFLICT: 409,

    VOUCHER_TERMS_LOCKED_AFTER_USAGE: 409,
    VOUCHER_USAGE_LIMIT_BELOW_USED: 409,

    // ==========================================
    // MEMBERS
    // ==========================================

    MEMBER_NOT_FOUND: 404,
    MEMBER_STATUS_INVALID: 400,
    MEMBER_STATUS_UNCHANGED: 409,
    MEMBER_CONCURRENT_UPDATE: 409,

    // ==========================================
    // MEMBER PROFILE REQUESTS
    // ==========================================

    MEMBER_PROFILE_REQUEST_NOT_FOUND: 404,
    MEMBER_PROFILE_REQUEST_USER_NOT_FOUND: 404,

    MEMBER_PROFILE_REQUEST_INVALID_DATA: 400,
    MEMBER_PROFILE_REQUEST_REJECTION_REASON_REQUIRED: 400,

    MEMBER_PROFILE_REQUEST_ALREADY_PENDING: 409,
    MEMBER_PROFILE_REQUEST_CANNOT_BE_APPROVED: 409,
    MEMBER_PROFILE_REQUEST_CANNOT_BE_REJECTED: 409,
    MEMBER_PROFILE_REQUEST_CONCURRENT_UPDATE: 409,

    // ==========================================
    // RETURNS & EXCHANGES
    // ==========================================

    RETURN_REQUEST_NOT_FOUND: 404,
    RETURN_ORDER_NOT_PAID: 409,
    RETURN_ORDER_NOT_DELIVERED: 409,
    RETURN_WINDOW_EXPIRED: 409,
    ORDER_ITEM_NOT_FOUND: 404,
    RETURN_ITEM_ALREADY_REQUESTED: 409,
    RETURN_ORDER_HAS_ACTIVE_REQUEST: 409,
    RETURN_REQUEST_CANNOT_BE_APPROVED: 409,
    RETURN_REQUEST_CANNOT_BE_REJECTED: 409,
    RETURN_REQUEST_NOT_APPROVED: 409,
    RETURN_REFUND_NOT_PENDING: 409,
    RETURN_REFUND_ALREADY_RECORDED: 409,
    RETURN_REFUND_REFERENCE_ALREADY_USED: 409,
    RETURN_REFUND_AMOUNT_INVALID: 409,
    RETURN_EXCHANGE_NOT_WAITING_FOR_STOCK: 409,
    EXCHANGE_STOCK_STILL_INSUFFICIENT: 409,
    EXCHANGE_VARIANT_UNAVAILABLE: 409,
    RETURN_CONCURRENT_UPDATE: 409,
    PAYMENT_NOT_REFUNDABLE: 409,
    INVENTORY_NOT_FOUND: 404,
    RETURN_INVENTORY_QUANTITY_INVALID: 409,

    // ==========================================
    // ADDRESS BOOK
    // ==========================================

    ADDRESS_NOT_FOUND: 404,
    ADDRESS_LIMIT_REACHED: 409,
    ADDRESS_CONCURRENT_UPDATE: 409,
    // ==========================================
    // CHAT
    // ==========================================

    CHAT_CONVERSATION_NOT_FOUND: 404,
    CHAT_MESSAGE_CURSOR_INVALID: 400,

    CHAT_CONVERSATION_CLOSED: 409,
    CHAT_CONVERSATION_ALREADY_CLOSED: 409,
    CHAT_CONCURRENT_UPDATE: 409,

    // ==========================================
    // CART
    // ==========================================

    CART_ITEM_NOT_FOUND: 404,
    CART_INSUFFICIENT_STOCK: 409,
    CART_CONFLICT: 409,
    CART_CONCURRENT_UPDATE: 409,
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

    if (
        req.originalUrl === "/api/member/vouchers/validate" ||
        statusCode >= 500
    ) {
        console.error("[VOUCHER VALIDATION ERROR]", {
            message: err.message,
            statusCode: err.statusCode,
            code: err.code,
            stack: err.stack,
        });
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

