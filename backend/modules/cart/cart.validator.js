
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendValidationError(res, field, message) {
    return res.status(400).json({
        success: false,
        message: "VALIDATION_ERROR",
        details: [{ field, message }],
    });
}

function validateUuidParam(paramName) {
    return (req, res, next) => {
        const value = req.params[paramName];

        if (
            typeof value !== "string" ||
            !UUID_PATTERN.test(value)
        ) {
            return sendValidationError(
                res,
                paramName,
                "ID không hợp lệ."
            );
        }

        return next();
    };
}

function validateAddItem(req, res, next) {
    const { variantId, quantity } = req.body || {};

    if (
        typeof variantId !== "string" ||
        !UUID_PATTERN.test(variantId)
    ) {
        return sendValidationError(
            res,
            "variantId",
            "variantId phải là UUID hợp lệ."
        );
    }

    if (
        quantity !== undefined &&
        (!Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 99)
    ) {
        return sendValidationError(
            res,
            "quantity",
            "quantity phải là số nguyên từ 1 đến 99."
        );
    }

    req.body.quantity = quantity ?? 1;

    return next();
}

function validateUpdateItem(req, res, next) {
    const { quantity } = req.body || {};

    if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
    ) {
        return sendValidationError(
            res,
            "quantity",
            "quantity phải là số nguyên từ 1 đến 99."
        );
    }

    return next();
}

module.exports = {
    validateUuidParam,
    validateAddItem,
    validateUpdateItem,
};
