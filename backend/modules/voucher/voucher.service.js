const prisma = require("../../core/database/prisma");
const { Prisma } = require("@prisma/client");

const COMMERCIAL_FIELDS = [
    "code",
    "discountType",
    "discountValue",
    "maxDiscount",
    "minOrderAmount",
    "perUserLimit",
];

function throwValidationError(field, message) {
    const error = new Error("VALIDATION_ERROR");

    error.details = [{
        field,
        message,
    }];

    throw error;
}

function assertUuid(id) {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (typeof id !== "string" || !uuidRegex.test(id)) {
        throwValidationError("id", "Voucher ID không hợp lệ");
    }
}

function normalizeVoucherCode(code) {
    return code.trim().toUpperCase();
}

const DECIMAL_FIELDS = [
    "discountValue",
    "maxDiscount",
    "minOrderAmount",
];

function areVoucherValuesEqual(field, incoming, existing) {
    if (field === "code") {
        return normalizeVoucherCode(incoming) === existing;
    }

    if (DECIMAL_FIELDS.includes(field)) {
        if (incoming === null || existing === null) {
            return incoming === existing;
        }

        return new Prisma.Decimal(incoming).equals(existing);
    }

    return incoming === existing;
}

function validateCompleteVoucher(input) {
    if (
        input.discountType === "PERCENTAGE" &&
        Number(input.discountValue) > 100
    ) {
        throwValidationError(
            "discountValue",
            "Phần trăm giảm giá không được vượt quá 100"
        );
    }

    if (new Date(input.endsAt) <= new Date(input.startsAt)) {
        throwValidationError(
            "endsAt",
            "Thời gian kết thúc phải sau thời gian bắt đầu"
        );
    }
}

function handleVoucherError(error) {

    if (error.code === "P2034") {
        throw new Error("VOUCHER_CONCURRENT_UPDATE");
    }

    if (error.code === "P2002") {
        const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join("_")
            : String(error.meta?.target || "");

        if (target.includes("code")) {
            throw new Error("VOUCHER_CODE_EXISTS");
        }

        throw new Error("VOUCHER_CONFLICT");
    }

    if (error.code === "P2025") {
        throw new Error("VOUCHER_NOT_FOUND");
    }

    throw error;
}

function buildVoucherWhere(filters = {}) {
    return {
        ...(filters.discountType
            ? { discountType: filters.discountType }
            : {}),

        ...(filters.isActive !== undefined
            ? { isActive: filters.isActive }
            : {}),

        ...(filters.search
            ? {
                OR: [
                    {
                        code: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {}),
    };
}

const voucherCountInclude = {
    _count: {
        select: {
            usages: true,
            orders: true,
        },
    },
};

// ==========================================
// LIST
// ==========================================

async function listVouchers(query = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const allowedSortFields = [
        "createdAt",
        "code",
        "startsAt",
        "endsAt",
        "discountValue",
    ];

    const sortBy = allowedSortFields.includes(query.sortBy)
        ? query.sortBy
        : "createdAt";

    const sortOrder = query.sortOrder === "asc"
        ? "asc"
        : "desc";

    const where = buildVoucherWhere(query);

    const [vouchers, total] = await prisma.$transaction([
        prisma.voucher.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                [sortBy]: sortOrder,
            },
            include: voucherCountInclude,
        }),

        prisma.voucher.count({ where }),
    ]);

    const items = vouchers.map((voucher) => {
        const { _count, ...data } = voucher;

        return {
            ...data,
            usageCount: _count.usages,
            orderCount: _count.orders,
        };
    });

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// GET DETAIL
// ==========================================

async function getVoucherById(id) {
    assertUuid(id);

    const voucher = await prisma.voucher.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    usages: true,
                    orders: true,
                },
            },
        },
    });

    if (!voucher) {
        throw new Error("VOUCHER_NOT_FOUND");
    }

    const { _count, ...data } = voucher;

    return {
        ...data,
        usageCount: _count.usages,
        orderCount: _count.orders,
    };
}

// ==========================================
// CREATE
// ==========================================

async function createVoucher(input) {
    const data = {
        code: normalizeVoucherCode(input.code),
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxDiscount: input.maxDiscount ?? null,
        minOrderAmount: input.minOrderAmount ?? 0,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isActive: input.isActive ?? true,
    };

    validateCompleteVoucher(data);

    try {
        return await prisma.voucher.create({
            data,
            include: voucherCountInclude,
        });
    } catch (error) {
        handleVoucherError(error);
    }
}

// ==========================================
// UPDATE
// ==========================================


async function updateVoucher(id, input) {
    assertUuid(id);

    try {
        return await prisma.$transaction(
            async (tx) => {
                const existing = await tx.voucher.findUnique({
                    where: { id },
                    include: {
                        _count: {
                            select: {
                                usages: true,
                            },
                        },
                    },
                });

                if (!existing) {
                    throw new Error("VOUCHER_NOT_FOUND");
                }

                const usageCount = existing._count.usages;

                // Không thay đổi điều kiện thương mại sau khi đã sử dụng.
                if (usageCount > 0) {
                    const changedFields = COMMERCIAL_FIELDS.filter(
                        (field) =>
                            input[field] !== undefined &&
                            !areVoucherValuesEqual(
                                field,
                                input[field],
                                existing[field]
                            )
                    );

                    if (changedFields.length > 0) {
                        throw new Error(
                            "VOUCHER_TERMS_LOCKED_AFTER_USAGE"
                        );
                    }
                }

                // Không giảm tổng lượt sử dụng thấp hơn số lượt đã dùng.
                if (
                    input.usageLimit !== undefined &&
                    input.usageLimit !== null &&
                    input.usageLimit < usageCount
                ) {
                    throw new Error(
                        "VOUCHER_USAGE_LIMIT_BELOW_USED"
                    );
                }

                const merged = {
                    ...existing,
                    ...input,
                };

                validateCompleteVoucher(merged);

                const data = { ...input };

                if (data.code !== undefined) {
                    data.code = normalizeVoucherCode(data.code);
                }

                return await tx.voucher.update({
                    where: { id },
                    data,
                    include: voucherCountInclude,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleVoucherError(error);
    }
}


// ==========================================
// UPDATE STATUS
// ==========================================

async function updateVoucherStatus(id, isActive) {
    assertUuid(id);

    try {
        return await prisma.voucher.update({
            where: { id },
            data: { isActive },
            include: voucherCountInclude,
        });
    } catch (error) {
        handleVoucherError(error);
    }
}

module.exports = {
    listVouchers,
    getVoucherById,
    createVoucher,
    updateVoucher,
    updateVoucherStatus,
};