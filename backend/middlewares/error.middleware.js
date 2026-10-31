
const ERROR_STATUS_MAP = {
    VALIDATION_ERROR: 400,

    EMAIL_ALREADY_EXISTS: 409,
    PHONE_ALREADY_EXISTS: 409,
    REGISTRATION_CONFLICT: 409,

    REGISTRATION_EMAIL_DELIVERY_FAILED: 503,

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
