const { Prisma } = require("@prisma/client");
const crypto = require("crypto");
const prisma = require("../../core/database/prisma");
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const RETURN_INCLUDE = {
    order: {
        select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentMethod: true,
            deliveredAt: true,
            payment: {
                select: {
                    id: true,
                    method: true,
                    status: true,
                    amount: true,
                },
            },
        },
    },
    user: {
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
        },
    },
    processedBy: {
        select: {
            id: true,
            fullName: true,
            email: true,
        },
    },
    items: {
        include: {
            orderItem: true,
            exchangeVariant: {
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            },
        },
    },
    replacementOrder: {
        select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentMethod: true,
            createdAt: true,
        },
    },
};

function throwError(message, statusCode = 409) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function throwValidationError(field, message) {
    const error = new Error("VALIDATION_ERROR");
    error.statusCode = 400;
    error.details = [{ field, message }];
    throw error;
}

function assertUuid(value, field) {
    if (
        typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
        throwValidationError(field, "ID không hợp lệ");
    }
}

function handleReturnError(error) {
    if (error.code === "P2034") {
        throwError("RETURN_CONCURRENT_UPDATE", 409);
    }

    if (error.code === "P2002") {
        const rawTarget = Array.isArray(error.meta?.target)
            ? error.meta.target.join(" ")
            : String(error.meta?.target || "");

        const target = rawTarget
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

        if (
            target.includes("orderitemid") ||
            target.includes("returnitemorderitemid")
        ) {
            throwError("RETURN_ITEM_ALREADY_REQUESTED", 409);
        }

        if (target.includes("idempotencykey")) {
            throwError("RETURN_REFUND_ALREADY_RECORDED", 409);
        }

        if (
            target.includes("providertxnid") ||
            target.includes("paymenttransactionsrefundprovidertxnunique")
        ) {
            throwError("RETURN_REFUND_REFERENCE_ALREADY_USED", 409);
        }

        throwError("RETURN_CONCURRENT_UPDATE", 409);
    }

    throw error;
}

function calculateRefundAmount(orderItem, requestedQuantity) {
    if (
        !orderItem ||
        !Number.isSafeInteger(requestedQuantity) ||
        requestedQuantity < 1 ||
        !Number.isSafeInteger(orderItem.quantity) ||
        orderItem.quantity < requestedQuantity
    ) {
        throwError("RETURN_REFUND_AMOUNT_INVALID", 409);
    }

    const grossAmount = new Prisma.Decimal(orderItem.unitPrice)
        .mul(requestedQuantity);

    const allocatedDiscount = new Prisma.Decimal(
        orderItem.discountAmount || 0
    )
        .mul(requestedQuantity)
        .div(orderItem.quantity);

    const refundAmount = grossAmount
        .minus(allocatedDiscount)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    if (!refundAmount.isFinite() || refundAmount.lte(0)) {
        throwError("RETURN_REFUND_AMOUNT_INVALID", 409);
    }

    return refundAmount;
}

function getReturnPagination(query = {}) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const skip = (page - 1) * limit;

    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger(skip)
    ) {
        throwError("RETURN_INVALID_PAGINATION", 400);
    }

    return {
        page,
        limit,
        skip,
    };
}

async function getReturnOrThrow(tx, returnRequestId) {
    const request = await tx.returnRequest.findUnique({
        where: { id: returnRequestId },
        include: RETURN_INCLUDE,
    });

    if (!request) {
        throwError("RETURN_REQUEST_NOT_FOUND", 404);
    }

    return request;
}

async function createReplacementOrder(tx, request, returnItem, adminId) {
    if (
        request.resolution !== "EXCHANGE" ||
        request.status !== "WAITING_FOR_STOCK" ||
        returnItem.status !== "WAITING_FOR_STOCK"
    ) {
        throwError("RETURN_EXCHANGE_NOT_WAITING_FOR_STOCK", 409);
    }

    if (
        !Number.isSafeInteger(returnItem.exchangeQuantity) ||
        returnItem.exchangeQuantity < 1
    ) {
        throwError("RETURN_EXCHANGE_QUANTITY_INVALID", 409);
    }

    const originalItem = returnItem.orderItem;

    const targetVariant = await tx.productVariant.findUnique({
        where: {
            id: returnItem.exchangeVariantId,
        },
        include: {
            product: {
                select: {
                    id: true,
                    name: true,
                    status: true,
                },
            },
        },
    });

    if (
        !targetVariant ||
        !targetVariant.isActive ||
        targetVariant.product.status !== "ACTIVE" ||
        targetVariant.productId !== originalItem.productId
    ) {
        throwError("EXCHANGE_VARIANT_UNAVAILABLE", 409);
    }

    const inventory = await tx.inventory.findUnique({
        where: {
            variantId: targetVariant.id,
        },
    });

    if (!inventory) {
        throwError("INVENTORY_NOT_FOUND", 404);
    }

    const availableQuantity =
        inventory.quantityOnHand - inventory.reservedQuantity;

    if (availableQuantity < returnItem.exchangeQuantity) {
        return null;
    }

    const reservation = await tx.inventory.updateMany({
        where: {
            id: inventory.id,
            reservedQuantity: inventory.reservedQuantity,
            AND: [
                {
                    quantityOnHand: inventory.quantityOnHand,
                },
                {
                    quantityOnHand: {
                        gte:
                            inventory.reservedQuantity +
                            returnItem.exchangeQuantity,
                    },
                },
            ],
        },
        data: {
            reservedQuantity: {
                increment: returnItem.exchangeQuantity,
            },
        },
    });

    if (reservation.count !== 1) {
        throwError("RETURN_CONCURRENT_UPDATE", 409);
    }

    const now = new Date();

    const orderNumber =
        "EX-" +
        now.toISOString().slice(0, 10).replace(/-/g, "") +
        "-" +
        crypto.randomBytes(4).toString("hex").toUpperCase();

    const replacementOrder = await tx.order.create({
        data: {
            orderNumber,
            userId: request.userId,
            status: "PENDING_CONFIRMATION",
            paymentMethod: "INTERNAL_EXCHANGE",
            subtotal: new Prisma.Decimal(0),
            discountAmount: new Prisma.Decimal(0),
            shippingFee: new Prisma.Decimal(0),
            totalAmount: new Prisma.Decimal(0),

            shippingRecipientName: request.order.shippingRecipientName,
            shippingPhone: request.order.shippingPhone,
            shippingProvinceCity: request.order.shippingProvinceCity,
            shippingDistrict: request.order.shippingDistrict,
            shippingStreet: request.order.shippingStreet,
            shippingAddressNote: request.order.shippingAddressNote,

            customerNote:
                "Đơn hàng thay thế cho " +
                request.order.orderNumber +
                " / yêu cầu " +
                request.id,

            items: {
                create: {
                    productId: originalItem.productId,
                    variantId: targetVariant.id,
                    productName: originalItem.productName,
                    variantName: targetVariant.name,
                    sku: targetVariant.sku,
                    variantAttributes: targetVariant.attributes,
                    unitPrice: new Prisma.Decimal(0),
                    quantity: returnItem.exchangeQuantity,
                    lineTotal: new Prisma.Decimal(0),
                    discountAmount: new Prisma.Decimal(0),
                },
            },
        },
    });

    await tx.payment.create({
        data: {
            orderId: replacementOrder.id,
            method: "INTERNAL_EXCHANGE",
            status: "NOT_REQUIRED",
            amount: new Prisma.Decimal(0),
        },
    });

    await tx.orderStatusHistory.create({
        data: {
            orderId: replacementOrder.id,
            changedById: adminId,
            oldStatus: null,
            newStatus: "PENDING_CONFIRMATION",
            note: "Đơn thay thế được tạo từ yêu cầu " + request.id,
        },
    });

    const itemUpdate = await tx.returnItem.updateMany({
        where: {
            id: returnItem.id,
            status: "WAITING_FOR_STOCK",
        },
        data: {
            status: "REPLACEMENT_PENDING",
        },
    });

    if (itemUpdate.count !== 1) {
        throwError("RETURN_CONCURRENT_UPDATE", 409);
    }

    const requestUpdate = await tx.returnRequest.updateMany({
        where: {
            id: request.id,
            status: "WAITING_FOR_STOCK",
            replacementOrderId: null,
        },
        data: {
            status: "REPLACEMENT_PENDING",
            replacementOrderId: replacementOrder.id,
            processedById: adminId,
            processedAt: null,
            adminNote: "Đã tạo đơn hàng thay thế, đang chờ giao",
        },
    });

    if (requestUpdate.count !== 1) {
        throwError("RETURN_CONCURRENT_UPDATE", 409);
    }

    return replacementOrder;
}

// ==========================================
// CUSTOMER
// ==========================================



async function createReturnRequest(userId, input) {
    assertUuid(userId, "userId");

    if (!input || typeof input !== "object") {
        throwValidationError("body", "Dữ liệu yêu cầu không hợp lệ");
    }

    assertUuid(input.orderId, "orderId");

    if (!Array.isArray(input.items) || input.items.length < 1) {
        throwValidationError(
            "items",
            "Vui lòng chọn ít nhất một sản phẩm"
        );
    }

    const seenOrderItemIds = new Set();

    for (let index = 0; index < input.items.length; index++) {
        const item = input.items[index];

        if (!item || typeof item !== "object") {
            throwValidationError(
                `items.${index}`,
                "Thông tin sản phẩm không hợp lệ"
            );
        }

        assertUuid(
            item.orderItemId,
            `items.${index}.orderItemId`
        );

        if (seenOrderItemIds.has(item.orderItemId)) {
            throwValidationError(
                `items.${index}.orderItemId`,
                "Không được chọn trùng sản phẩm"
            );
        }

        seenOrderItemIds.add(item.orderItemId);

        if (!["REFUND", "EXCHANGE"].includes(item.resolution)) {
            throwValidationError(
                `items.${index}.resolution`,
                "Hình thức xử lý yêu cầu không hợp lệ"
            );
        }

        if (
            !Number.isSafeInteger(item.quantity) ||
            item.quantity < 1
        ) {
            throwValidationError(
                `items.${index}.quantity`,
                "Số lượng yêu cầu không hợp lệ"
            );
        }

        if (
            typeof item.reason !== "string" ||
            item.reason.trim().length < 3 ||
            item.reason.trim().length > 500
        ) {
            throwValidationError(
                `items.${index}.reason`,
                "Lý do yêu cầu phải có từ 3 đến 500 ký tự"
            );
        }

        if (item.resolution === "EXCHANGE") {
            assertUuid(
                item.exchangeVariantId,
                `items.${index}.exchangeVariantId`
            );
        } else if (item.exchangeVariantId) {
            throwValidationError(
                `items.${index}.exchangeVariantId`,
                "Yêu cầu hoàn tiền không nhận phiên bản đổi"
            );
        }
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findFirst({
                    where: {
                        id: input.orderId,
                        userId,
                    },
                    include: {
                        payment: true,
                        items: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (
                    !order.payment ||
                    !["PAID", "PARTIALLY_REFUNDED"].includes(
                        order.payment.status
                    )
                ) {
                    throwError("RETURN_ORDER_NOT_PAID", 409);
                }

                if (
                    !order.deliveredAt ||
                    !["DELIVERED", "COMPLETED"].includes(order.status)
                ) {
                    throwError("RETURN_ORDER_NOT_DELIVERED", 409);
                }

                const deliveredAt = new Date(order.deliveredAt).getTime();
                const now = Date.now();

                if (
                    !Number.isFinite(deliveredAt) ||
                    deliveredAt > now ||
                    now - deliveredAt > THREE_DAYS_MS
                ) {
                    throwError("RETURN_WINDOW_EXPIRED", 409);
                }

                // Chuẩn bị toàn bộ dữ liệu trước khi tạo request.
                // Bất kỳ sản phẩm nào không hợp lệ đều làm rollback batch.
                const preparedItems = [];

                for (let index = 0; index < input.items.length; index++) {
                    const inputItem = input.items[index];

                    const orderItem = order.items.find(
                        (item) => item.id === inputItem.orderItemId
                    );

                    if (!orderItem) {
                        throwError("ORDER_ITEM_NOT_FOUND", 404);
                    }

                    // Khóa vĩnh viễn theo OrderItem:
                    // đã từng tạo ReturnItem thì không được yêu cầu lại,
                    // kể cả request trước đó đã bị từ chối hoặc hủy.
                    const existingItemRequest =
                        await tx.returnItem.findUnique({
                            where: {
                                orderItemId: orderItem.id,
                            },
                            select: {
                                id: true,
                                returnRequestId: true,
                            },
                        });

                    if (existingItemRequest) {
                        throwError("RETURN_ITEM_ALREADY_REQUESTED", 409);
                    }

                    if (
                        inputItem.quantity > orderItem.quantity
                    ) {
                        throwValidationError(
                            `items.${index}.quantity`,
                            "Số lượng yêu cầu vượt quá số lượng đã mua"
                        );
                    }

                    const isExchange =
                        inputItem.resolution === "EXCHANGE";

                    let exchangeVariant = null;

                    if (isExchange) {
                        if (
                            inputItem.exchangeVariantId ===
                            orderItem.variantId
                        ) {
                            throwValidationError(
                                `items.${index}.exchangeVariantId`,
                                "Vui lòng chọn phiên bản khác với sản phẩm đã mua"
                            );
                        }

                        exchangeVariant =
                            await tx.productVariant.findUnique({
                                where: {
                                    id: inputItem.exchangeVariantId,
                                },
                                include: {
                                    product: {
                                        select: {
                                            id: true,
                                            status: true,
                                        },
                                    },
                                },
                            });

                        if (
                            !exchangeVariant ||
                            !exchangeVariant.isActive ||
                            exchangeVariant.product.status !== "ACTIVE"
                        ) {
                            throwError(
                                "EXCHANGE_VARIANT_UNAVAILABLE",
                                409
                            );
                        }

                        if (
                            exchangeVariant.productId !==
                            orderItem.productId
                        ) {
                            throwValidationError(
                                `items.${index}.exchangeVariantId`,
                                "Chỉ được đổi sang phiên bản khác của cùng sản phẩm"
                            );
                        }
                    }

                    const refundAmount = isExchange
                        ? null
                        : calculateRefundAmount(
                            orderItem,
                            inputItem.quantity
                        );

                    if (
                        !isExchange &&
                        (
                            !refundAmount ||
                            !refundAmount.isFinite() ||
                            refundAmount.lte(0)
                        )
                    ) {
                        throwError(
                            "RETURN_REFUND_AMOUNT_INVALID",
                            409
                        );
                    }

                    preparedItems.push({
                        inputItem,
                        orderItem,
                        isExchange,
                        exchangeVariant,
                        refundAmount,
                    });
                }

                // Không kiểm tra ReturnRequest đang hoạt động theo orderId.
                // Một Order được phép có nhiều request độc lập,
                // miễn là mỗi request thuộc một OrderItem khác nhau.

                const createdRequests = [];

                for (const prepared of preparedItems) {
                    const {
                        inputItem,
                        orderItem,
                        isExchange,
                        exchangeVariant,
                        refundAmount,
                    } = prepared;

                    const request = await tx.returnRequest.create({
                        data: {
                            orderId: order.id,
                            userId,

                            type: isExchange
                                ? "EXCHANGE"
                                : "RETURN",

                            resolution: inputItem.resolution,
                            status: "REQUESTED",

                            reason: inputItem.reason.trim(),

                            customerNote:
                                typeof inputItem.customerNote === "string"
                                    ? inputItem.customerNote.trim() || null
                                    : null,

                            refundAmount,

                            items: {
                                create: {
                                    orderItemId: orderItem.id,
                                    quantity: inputItem.quantity,
                                    status: "PENDING",

                                    exchangeVariantId:
                                        exchangeVariant?.id || null,

                                    exchangeQuantity: isExchange
                                        ? inputItem.quantity
                                        : null,
                                },
                            },
                        },
                        include: RETURN_INCLUDE,
                    });

                    createdRequests.push(request);
                }

                return {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    createdCount: createdRequests.length,
                    requests: createdRequests,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleReturnError(error);
    }
}


async function listMyEligibleOrders(userId) {
    assertUuid(userId, "userId");

    const now = new Date();
    const cutoff = new Date(now.getTime() - THREE_DAYS_MS);

    const orders = await prisma.order.findMany({
        where: {
            userId,
            status: {
                in: ["DELIVERED", "COMPLETED"],
            },
            deliveredAt: {
                gte: cutoff,
                lte: now,
            },
            payment: {
                is: {
                    status: {
                        in: ["PAID", "PARTIALLY_REFUNDED"],
                    },
                },
            },
            items: {
                some: {
                    returnItems: {
                        none: {},
                    },
                },
            },
        },
        orderBy: {
            deliveredAt: "desc",
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveredAt: true,
            items: {
                where: {
                    returnItems: {
                        none: {},
                    },
                },
                select: {
                    id: true,
                    productId: true,
                    variantId: true,
                    productName: true,
                    variantName: true,
                    sku: true,
                    quantity: true,
                    unitPrice: true,
                    lineTotal: true,
                },
            },
        },
    });

    return orders;
}


async function listMyReturnRequests(userId, query = {}) {
    assertUuid(userId, "userId");

    const { page, limit, skip } = getReturnPagination(query);

    const where = { userId };

    const [items, total] = await prisma.$transaction([
        prisma.returnRequest.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
            include: RETURN_INCLUDE,
        }),

        prisma.returnRequest.count({
            where,
        }),
    ]);

    return {
        data: items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

async function getMyReturnRequest(userId, returnRequestId) {
    assertUuid(userId, "userId");
    assertUuid(returnRequestId, "returnRequestId");

    const request = await prisma.returnRequest.findFirst({
        where: {
            id: returnRequestId,
            userId,
        },
        include: RETURN_INCLUDE,
    });

    if (!request) {
        throwError("RETURN_REQUEST_NOT_FOUND", 404);
    }

    return request;
}

// ==========================================
// ADMIN
// ==========================================

async function listAdminReturnRequests(query = {}) {
    const { page, limit, skip } = getReturnPagination(query);

    const search =
        typeof query.search === "string"
            ? query.search.trim()
            : "";

    const where = {
        ...(query.customerId
            ? { userId: query.customerId }
            : {}),

        ...(query.status
            ? { status: query.status }
            : {}),

        ...(query.resolution
            ? { resolution: query.resolution }
            : {}),

        ...(search
            ? {
                OR: [
                    {
                        order: {
                            is: {
                                orderNumber: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        user: {
                            is: {
                                fullName: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        user: {
                            is: {
                                email: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                ],
            }
            : {}),
    };

    const [items, total] = await prisma.$transaction([
        prisma.returnRequest.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: "desc",
            },
            include: RETURN_INCLUDE,
        }),

        prisma.returnRequest.count({
            where,
        }),
    ]);

    return {
        data: items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

async function getAdminReturnRequest(returnRequestId) {
    assertUuid(returnRequestId, "returnRequestId");
    return getReturnOrThrow(prisma, returnRequestId);
}

async function approveReturnRequest(returnRequestId, adminId, adminNote = null) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (request.status !== "REQUESTED") {
                throwError("RETURN_REQUEST_CANNOT_BE_APPROVED", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            const result = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: "REQUESTED",
                },
                data: {
                    status: "APPROVED",
                    processedById: adminId,
                    adminNote:
                        typeof adminNote === "string" && adminNote.trim()
                            ? adminNote.trim()
                            : null,
                },
            });

            if (result.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}

async function rejectReturnRequest(returnRequestId, adminId, rejectionReason) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    if (
        typeof rejectionReason !== "string" ||
        !rejectionReason.trim()
    ) {
        throwValidationError(
            "rejectionReason",
            "Lý do từ chối không được để trống"
        );
    }

    const normalizedReason = rejectionReason.trim();

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (!["REQUESTED", "APPROVED", "INSPECTING"].includes(request.status)) {
                throwError("RETURN_REQUEST_CANNOT_BE_REJECTED", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            const item = request.items[0];

            const requestUpdate = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: request.status,
                },
                data: {
                    status: "REJECTED",
                    processedById: adminId,
                    processedAt: new Date(),
                    adminNote: normalizedReason,
                },
            });

            if (requestUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            const itemUpdate = await tx.returnItem.updateMany({
                where: {
                    id: item.id,
                    status: item.status,
                },
                data: {
                    status: "REJECTED",
                    rejectionReason: normalizedReason,
                },
            });

            if (itemUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}

async function receiveReturnedItem(returnRequestId, adminId) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (request.status !== "APPROVED") {
                throwError("RETURN_REQUEST_NOT_APPROVED", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            const receivedAt = new Date();

            const requestUpdate = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: "APPROVED",
                },
                data: {
                    status: "INSPECTING",
                    receivedAt,
                    processedById: adminId,
                    adminNote:
                        request.adminNote || "Đã nhận hàng, đang chờ kiểm tra",
                },
            });

            if (requestUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}

async function acceptReturnedItem(
    returnRequestId,
    adminId,
    conditionNote = null
) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (request.status !== "INSPECTING") {
                throwError("RETURN_REQUEST_NOT_INSPECTING", 409);
            }

            if (!["REFUND", "EXCHANGE"].includes(request.resolution)) {
                throwError("RETURN_RESOLUTION_INVALID", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            const returnItem = request.items[0];

            if (returnItem.status !== "PENDING") {
                throwError("RETURN_ITEM_CANNOT_BE_ACCEPTED", 409);
            }

            if (
                !Number.isSafeInteger(returnItem.quantity) ||
                returnItem.quantity < 1
            ) {
                throwError("RETURN_INVENTORY_QUANTITY_INVALID", 409);
            }

            const originalItem = returnItem.orderItem;

            const inventory = await tx.inventory.findUnique({
                where: {
                    variantId: originalItem.variantId,
                },
            });

            if (!inventory) {
                throwError("INVENTORY_NOT_FOUND", 404);
            }

            const newOnHand =
                inventory.quantityOnHand + returnItem.quantity;

            if (!Number.isSafeInteger(newOnHand)) {
                throwError("RETURN_INVENTORY_QUANTITY_INVALID", 409);
            }

            const now = new Date();

            const inventoryUpdate = await tx.inventory.updateMany({
                where: {
                    id: inventory.id,
                    quantityOnHand: inventory.quantityOnHand,
                    reservedQuantity: inventory.reservedQuantity,
                },
                data: {
                    quantityOnHand: newOnHand,
                },
            });

            if (inventoryUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            await tx.inventoryMovement.create({
                data: {
                    variantId: originalItem.variantId,
                    type: "CUSTOMER_RETURN",
                    quantity: returnItem.quantity,
                    beforeStock: inventory.quantityOnHand,
                    afterStock: newOnHand,
                    referenceId: request.id,
                    note:
                        "Admin chấp nhận hàng hoàn từ yêu cầu " +
                        request.id,
                    createdBy: adminId,
                },
            });

            const nextItemStatus =
                request.resolution === "REFUND"
                    ? "REFUND_PENDING"
                    : "WAITING_FOR_STOCK";

            const itemUpdate = await tx.returnItem.updateMany({
                where: {
                    id: returnItem.id,
                    status: "PENDING",
                },
                data: {
                    conditionNote:
                        typeof conditionNote === "string" && conditionNote.trim()
                            ? conditionNote.trim()
                            : null,
                    status: nextItemStatus,
                },
            });

            if (itemUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            const nextRequestStatus =
                request.resolution === "REFUND"
                    ? "REFUND_PENDING"
                    : "WAITING_FOR_STOCK";

            const requestUpdate = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: "INSPECTING",
                },
                data: {
                    status: nextRequestStatus,
                    inspectedAt: now,
                    processedById: adminId,
                    adminNote:
                        request.resolution === "REFUND"
                            ? "Hàng hoàn đạt yêu cầu kiểm tra, chờ hoàn tiền"
                            : "Hàng hoàn đạt yêu cầu kiểm tra, chờ tạo đơn thay thế",
                },
            });

            if (requestUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            if (request.resolution === "REFUND") {
                return getReturnOrThrow(tx, request.id);
            }

            const originalOrderAddress = await tx.order.findUnique({
                where: {
                    id: request.orderId,
                },
                select: {
                    shippingRecipientName: true,
                    shippingPhone: true,
                    shippingProvinceCity: true,
                    shippingDistrict: true,
                    shippingStreet: true,
                    shippingAddressNote: true,
                },
            });

            if (!originalOrderAddress) {
                throwError("ORDER_NOT_FOUND", 404);
            }

            const requestForReplacement = {
                ...request,
                status: "WAITING_FOR_STOCK",
                adminNote:
                    "Hàng hoàn đạt yêu cầu kiểm tra, chờ tạo đơn thay thế",
                order: {
                    ...request.order,
                    ...originalOrderAddress,
                },
            };

            const replacementOrder = await createReplacementOrder(
                tx,
                requestForReplacement,
                {
                    ...returnItem,
                    status: "WAITING_FOR_STOCK",
                },
                adminId
            );

            // null nghĩa là chưa đủ hàng, yêu cầu tiếp tục WAITING_FOR_STOCK.
            if (!replacementOrder) {
                return getReturnOrThrow(tx, request.id);
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}

async function retryExchangeWhenStockAvailable(
    returnRequestId,
    adminId,
    adminNote = null
) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (
                request.resolution !== "EXCHANGE" ||
                request.status !== "WAITING_FOR_STOCK"
            ) {
                throwError("RETURN_EXCHANGE_NOT_WAITING_FOR_STOCK", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            if (request.items[0].status !== "WAITING_FOR_STOCK") {
                throwError("RETURN_ITEM_NOT_WAITING_FOR_STOCK", 409);
            }

            const originalOrderAddress = await tx.order.findUnique({
                where: { id: request.orderId },
                select: {
                    shippingRecipientName: true,
                    shippingPhone: true,
                    shippingProvinceCity: true,
                    shippingDistrict: true,
                    shippingStreet: true,
                    shippingAddressNote: true,
                },
            });

            if (!originalOrderAddress) {
                throwError("ORDER_NOT_FOUND", 404);
            }

            const requestForReplacement = {
                ...request,
                order: {
                    ...request.order,
                    ...originalOrderAddress,
                },
            };

            const replacementOrder = await createReplacementOrder(
                tx,
                requestForReplacement,
                request.items[0],
                adminId
            );

            if (!replacementOrder) {
                throwError("EXCHANGE_STOCK_STILL_INSUFFICIENT", 409);
            }

            const normalizedAdminNote =
                typeof adminNote === "string" ? adminNote.trim() : "";

            if (normalizedAdminNote) {
                const noteUpdate = await tx.returnRequest.updateMany({
                    where: {
                        id: request.id,
                        status: "REPLACEMENT_PENDING",
                        replacementOrderId: replacementOrder.id,
                    },
                    data: {
                        adminNote: normalizedAdminNote,
                    },
                });

                if (noteUpdate.count !== 1) {
                    throwError("RETURN_CONCURRENT_UPDATE", 409);
                }
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}

async function confirmManualRefund(returnRequestId, adminId, input) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (
                request.resolution !== "REFUND" ||
                request.status !== "REFUND_PENDING"
            ) {
                throwError("RETURN_REFUND_NOT_PENDING", 409);
            }

            if (request.items.length !== 1) {
                throwError("RETURN_ITEM_COUNT_INVALID", 409);
            }

            if (
                !input ||
                typeof input.refundReference !== "string" ||
                !input.refundReference.trim() ||
                input.refundReference.trim().length > 120
            ) {
                throwValidationError(
                    "refundReference",
                    "Mã tham chiếu hoàn tiền phải có từ 1 đến 120 ký tự"
                );
            }

            const refundReference = input.refundReference.trim();

            const order = await tx.order.findUnique({
                where: { id: request.orderId },
                include: { payment: true },
            });

            if (!order || !order.payment) {
                throwError("PAYMENT_NOT_FOUND", 404);
            }

            const payment = order.payment;

            if (!["PAID", "PARTIALLY_REFUNDED"].includes(payment.status)) {
                throwError("PAYMENT_NOT_REFUNDABLE", 409);
            }

            const idempotencyKey = "RETURN-REFUND-" + request.id;

            const existing = await tx.paymentTransaction.findUnique({
                where: { idempotencyKey },
            });

            if (existing) {
                throwError("RETURN_REFUND_ALREADY_RECORDED", 409);
            }

            const reusedReference = await tx.paymentTransaction.findFirst({
                where: {
                    providerTxnId: refundReference,
                    type: "REFUND",
                },
                select: { id: true },
            });

            if (reusedReference) {
                throwError("RETURN_REFUND_REFERENCE_ALREADY_USED", 409);
            }

            const amount = new Prisma.Decimal(request.refundAmount || 0);

            if (!amount.isFinite() || amount.lte(0)) {
                throwError("RETURN_REFUND_AMOUNT_INVALID", 409);
            }

            // Tổng hợp tất cả giao dịch hoàn tiền thành công trước giao dịch này.
            const priorRefunds = await tx.paymentTransaction.findMany({
                where: {
                    paymentId: payment.id,
                    type: "REFUND",
                    isSuccessful: true,
                },
                select: {
                    requestData: true,
                },
            });

            const previouslyRefunded = priorRefunds.reduce(
                (sum, item) => {
                    const previousAmount = new Prisma.Decimal(
                        item.requestData?.amount || 0
                    );

                    if (!previousAmount.isFinite() || previousAmount.lt(0)) {
                        throwError("RETURN_REFUND_AMOUNT_INVALID", 409);
                    }

                    return sum.add(previousAmount);
                },
                new Prisma.Decimal(0)
            );

            const totalRefunded = previouslyRefunded.add(amount);
            const paymentAmount = new Prisma.Decimal(payment.amount);

            // Không cho phép tổng tiền hoàn vượt số tiền thanh toán.
            if (totalRefunded.gt(paymentAmount)) {
                throwError("RETURN_REFUND_EXCEEDS_PAYMENT", 409);
            }

            const newPaymentStatus = totalRefunded.eq(paymentAmount)
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED";

            // CAS: chỉ cập nhật nếu Payment vẫn giữ trạng thái đã đọc.
            const paymentUpdate = await tx.payment.updateMany({
                where: {
                    id: payment.id,
                    status: payment.status,
                },
                data: {
                    status: newPaymentStatus,
                },
            });

            if (paymentUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            const now = new Date();

            await tx.paymentTransaction.create({
                data: {
                    paymentId: payment.id,
                    type: "REFUND",
                    requestData: {
                        source: "ADMIN_MANUAL_REFUND",
                        returnRequestId: request.id,
                        orderId: order.id,
                        adminId,
                        amount: amount.toFixed(2),
                    },
                    responseData: {
                        successful: true,
                        refundReference,
                        confirmedAt: now.toISOString(),
                    },
                    providerTxnId: refundReference,
                    idempotencyKey,
                    isSuccessful: true,
                },
            });

            const itemUpdate = await tx.returnItem.updateMany({
                where: {
                    id: request.items[0].id,
                    status: "REFUND_PENDING",
                },
                data: {
                    status: "COMPLETED",
                },
            });

            if (itemUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            const requestUpdate = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: "REFUND_PENDING",
                },
                data: {
                    status: "COMPLETED",
                    refundReference,
                    processedById: adminId,
                    processedAt: now,
                    adminNote:
                        input.adminNote ||
                        "Đã xác nhận hoàn tiền thủ công",
                },
            });

            if (requestUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            return getReturnOrThrow(tx, request.id);
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
    } catch (error) {
        handleReturnError(error);
    }
}


module.exports = {
    createReturnRequest,
    listMyReturnRequests,
    getMyReturnRequest,
    listAdminReturnRequests,
    getAdminReturnRequest,
    approveReturnRequest,
    rejectReturnRequest,
    receiveReturnedItem,
    retryExchangeWhenStockAvailable,
    confirmManualRefund,
    calculateRefundAmount,
    acceptReturnedItem,
    listMyEligibleOrders,
};
