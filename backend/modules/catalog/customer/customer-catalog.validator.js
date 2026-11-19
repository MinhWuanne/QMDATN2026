const ALLOWED_SORT_FIELDS = new Set([
    "createdAt",
    "name",
    "price",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_OR_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function sendValidationError(res, message) {
    return res.status(400).json({
        success: false,
        message,
    });
}

function isValidUuid(value) {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateListQuery(req, res, next) {
    const query = req.query || {};
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 12);

    if (!Number.isInteger(page) || page < 1) {
        return sendValidationError(
            res,
            "page phải là số nguyên lớn hơn hoặc bằng 1."
        );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        return sendValidationError(
            res,
            "limit phải là số nguyên từ 1 đến 50."
        );
    }

    const sortBy = query.sortBy || "createdAt";
    if (!ALLOWED_SORT_FIELDS.has(sortBy)) {
        return sendValidationError(res, "sortBy không hợp lệ.");
    }

    const sortOrder = String(query.sortOrder || "desc").toLowerCase();
    if (!["asc", "desc"].includes(sortOrder)) {
        return sendValidationError(
            res,
            "sortOrder chỉ được là asc hoặc desc."
        );
    }

    for (const field of ["categoryId", "brandId"]) {
        if (query[field] !== undefined && !isValidUuid(query[field])) {
            return sendValidationError(
                res,
                `${field} phải là UUID hợp lệ.`
            );
        }
    }

    if (
        query.search !== undefined &&
        (typeof query.search !== "string" || query.search.length > 200)
    ) {
        return sendValidationError(
            res,
            "search không hợp lệ hoặc vượt quá 200 ký tự."
        );
    }

    if (
        query.featured !== undefined &&
        !["true", "false"].includes(String(query.featured).toLowerCase())
    ) {
        return sendValidationError(
            res,
            "featured chỉ được là true hoặc false."
        );
    }

    res.locals.customerCatalogQuery = {
        page,
        limit,
        sortBy,
        sortOrder,
        search: typeof query.search === "string" ? query.search.trim() : "",
        categoryId: query.categoryId,
        brandId: query.brandId,
        featured: query.featured === undefined
            ? undefined
            : String(query.featured).toLowerCase() === "true",
    };

    return next();
}

function validateIdentifier(req, res, next) {
    const identifier = req.params.identifier;

    if (
        typeof identifier !== "string" ||
        !identifier.trim() ||
        identifier.length > 200 ||
        !SLUG_OR_ID_PATTERN.test(identifier)
    ) {
        return sendValidationError(
            res,
            "Mã hoặc slug sản phẩm không hợp lệ."
        );
    }

    return next();
}

module.exports = {
    validateListQuery,
    validateIdentifier,
};
