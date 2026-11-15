const { Prisma } = require("@prisma/client");
const crypto = require("crypto");
const prisma = require("../../core/database/prisma");

const TERMINAL_STATUSES = ["COMPLETED", "REJECTED", "CANCELLED"];
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
        throwError("RETURN_ITEM_ALREADY_REQUESTED", 409);
    }

    throw error;
}

function calculateRefundAmount(orderItem, requestedQuantity) {
    const grossAmount = new Prisma.Decimal(orderItem.unitPrice)
        .mul(requestedQuantity);

    const allocatedDiscount = new Prisma.Decimal(orderItem.discountAmount || 0)
        .mul(requestedQuantity)
        .div(orderItem.quantity);

    return grossAmount
        .minus(allocatedDiscount)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
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
    const originalItem = returnItem.orderItem;
    const targetVariant = await tx.productVariant.findUnique({
        where: { id: returnItem.exchangeVariantId },
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
        where: { variantId: targetVariant.id },
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
            quantityOnHand: inventory.quantityOnHand,
            reservedQuantity: inventory.reservedQuantity,
            quantityOnHand: {
                gte: inventory.reservedQuantity + returnItem.exchangeQuantity,
            },
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

    await tx.returnItem.update({
        where: { id: returnItem.id },
        data: { status: "COMPLETED" },
    });

    await tx.returnRequest.update({
        where: { id: request.id },
        data: {
            status: "COMPLETED",
            replacementOrderId: replacementOrder.id,
            processedById: adminId,
            processedAt: now,
            adminNote: request.adminNote || "Đã tạo đơn hàng thay thế",
        },
    });

    return replacementOrder;
}

// ==========================================
// CUSTOMER
// ==========================================

async function createReturnRequest(userId, input) {
    assertUuid(userId, "userId");
    assertUuid(input.orderId, "orderId");
    assertUuid(input.orderItemId, "orderItemId");

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

                if (!order.payment || order.payment.status !== "PAID") {
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
                    deliveredAt > now ||
                    now - deliveredAt > THREE_DAYS_MS
                ) {
                    throwError("RETURN_WINDOW_EXPIRED", 409);
                }

                const orderItem = order.items.find(
                    (item) => item.id === input.orderItemId
                );

                if (!orderItem) {
                    throwError("ORDER_ITEM_NOT_FOUND", 404);
                }

                const existingItemRequest =
                    await tx.returnItem.findUnique({
                        where: {
                            orderItemId: orderItem.id,
                        },
                    });

                if (existingItemRequest) {
                    throwError("RETURN_ITEM_ALREADY_REQUESTED", 409);
                }

                const activeRequest = await tx.returnRequest.findFirst({
                    where: {
                        orderId: order.id,
                        status: {
                            notIn: TERMINAL_STATUSES,
                        },
                    },
                    select: { id: true },
                });

                if (activeRequest) {
                    throwError("RETURN_ORDER_HAS_ACTIVE_REQUEST", 409);
                }

                if (
                    !Number.isInteger(input.quantity) ||
                    input.quantity < 1 ||
                    input.quantity > orderItem.quantity
                ) {
                    throwValidationError(
                        "quantity",
                        "Số lượng yêu cầu không hợp lệ"
                    );
                }

                const resolution = input.resolution;
                const isExchange = resolution === "EXCHANGE";
                let exchangeVariant = null;

                if (isExchange) {
                    assertUuid(input.exchangeVariantId, "exchangeVariantId");

                    if (input.exchangeVariantId === orderItem.variantId) {
                        throwValidationError(
                            "exchangeVariantId",
                            "Vui lòng chọn phiên bản khác với sản phẩm đã mua"
                        );
                    }

                    exchangeVariant = await tx.productVariant.findUnique({
                        where: { id: input.exchangeVariantId },
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
                        throwError("EXCHANGE_VARIANT_UNAVAILABLE", 409);
                    }

                    if (exchangeVariant.productId !== orderItem.productId) {
                        throwValidationError(
                            "exchangeVariantId",
                            "Chỉ được đổi sang phiên bản khác của cùng sản phẩm"
                        );
                    }
                }

                const refundAmount = isExchange
                    ? null
                    : calculateRefundAmount(orderItem, input.quantity);

                const request = await tx.returnRequest.create({
                    data: {
                        orderId: order.id,
                        userId,
                        type: isExchange ? "EXCHANGE" : "RETURN",
                        resolution,
                        status: "REQUESTED",
                        reason: input.reason,
                        customerNote: input.customerNote || null,
                        refundAmount,
                        items: {
                            create: {
                                orderItemId: orderItem.id,
                                quantity: input.quantity,
                                status: "PENDING",
                                exchangeVariantId: exchangeVariant?.id || null,
                                exchangeQuantity: isExchange
                                    ? input.quantity
                                    : null,
                            },
                        },
                    },
                    include: RETURN_INCLUDE,
                });

                return request;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleReturnError(error);
    }
}

async function listMyReturnRequests(userId, query = {}) {
    assertUuid(userId, "userId");

    const page = query.page || 1;
    const limit = query.limit || 20;
    const where = { userId };

    const [items, total] = await prisma.$transaction([
        prisma.returnRequest.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: RETURN_INCLUDE,
        }),
        prisma.returnRequest.count({ where }),
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
    const page = query.page || 1;
    const limit = query.limit || 20;

    const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.resolution ? { resolution: query.resolution } : {}),
        ...(query.search
            ? {
                OR: [
                    {
                        order: {
                            is: {
                                orderNumber: {
                                    contains: query.search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        user: {
                            is: {
                                fullName: {
                                    contains: query.search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                    {
                        user: {
                            is: {
                                email: {
                                    contains: query.search,
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
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: RETURN_INCLUDE,
        }),
        prisma.returnRequest.count({ where }),
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

            const result = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: "REQUESTED",
                },
                data: {
                    status: "APPROVED",
                    processedById: adminId,
                    adminNote: adminNote || null,
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

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (!["REQUESTED", "APPROVED"].includes(request.status)) {
                throwError("RETURN_REQUEST_CANNOT_BE_REJECTED", 409);
            }

            const item = request.items[0];

            await tx.returnItem.update({
                where: { id: item.id },
                data: {
                    status: "REJECTED",
                    rejectionReason,
                },
            });

            const result = await tx.returnRequest.updateMany({
                where: {
                    id: request.id,
                    status: request.status,
                },
                data: {
                    status: "REJECTED",
                    processedById: adminId,
                    processedAt: new Date(),
                    adminNote: rejectionReason,
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

async function receiveReturnedItem(returnRequestId, adminId, conditionNote = null) {
    assertUuid(returnRequestId, "returnRequestId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(async (tx) => {
            const request = await getReturnOrThrow(tx, returnRequestId);

            if (request.status !== "APPROVED") {
                throwError("RETURN_REQUEST_NOT_APPROVED", 409);
            }

            const returnItem = request.items[0];
            const originalItem = returnItem.orderItem;
            const inventory = await tx.inventory.findUnique({
                where: { variantId: originalItem.variantId },
            });

            if (!inventory) {
                throwError("INVENTORY_NOT_FOUND", 404);
            }

            const newOnHand = inventory.quantityOnHand + returnItem.quantity;
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
                    note: "Nhận hàng hoàn từ yêu cầu " + request.id,
                    createdBy: adminId,
                },
            });

            await tx.returnItem.update({
                where: { id: returnItem.id },
                data: {
                    conditionNote: conditionNote || null,
                    status: request.resolution === "REFUND"
                        ? "REFUND_PENDING"
                        : "WAITING_FOR_STOCK",
                },
            });

            const receivedAt = new Date();

            if (request.resolution === "REFUND") {
                await tx.returnRequest.update({
                    where: { id: request.id },
                    data: {
                        status: "REFUND_PENDING",
                        receivedAt,
                        processedById: adminId,
                        adminNote: request.adminNote || "Đã nhận hàng hoàn",
                    },
                });

                return getReturnOrThrow(tx, request.id);
            }

            const requestForReplacement = {
                ...request,
                order: {
                    ...request.order,
                    shippingRecipientName: request.order.shippingRecipientName,
                    shippingPhone: request.order.shippingPhone,
                    shippingProvinceCity: request.order.shippingProvinceCity,
                    shippingDistrict: request.order.shippingDistrict,
                    shippingStreet: request.order.shippingStreet,
                    shippingAddressNote: request.order.shippingAddressNote,
                },
            };

            // Address fields are fetched explicitly because RETURN_INCLUDE
            // intentionally keeps the customer-facing order summary compact.
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

            requestForReplacement.order = {
                ...requestForReplacement.order,
                ...originalOrderAddress,
            };

            await tx.returnRequest.update({
                where: { id: request.id },
                data: {
                    status: "WAITING_FOR_STOCK",
                    receivedAt,
                    processedById: adminId,
                    adminNote: request.adminNote || "Đã nhận hàng đổi",
                },
            });

            const replacementOrder = await createReplacementOrder(
                tx,
                requestForReplacement,
                returnItem,
                adminId
            );

            if (!replacementOrder) {
                await tx.returnItem.update({
                    where: { id: returnItem.id },
                    data: { status: "WAITING_FOR_STOCK" },
                });
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

async function retryExchangeWhenStockAvailable(returnRequestId, adminId) {
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

            const order = await tx.order.findUnique({
                where: { id: request.orderId },
                include: { payment: true },
            });

            if (!order || !order.payment) {
                throwError("PAYMENT_NOT_FOUND", 404);
            }

            if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.payment.status)) {
                throwError("PAYMENT_NOT_REFUNDABLE", 409);
            }

            const idempotencyKey = "RETURN-REFUND-" + request.id;
            const existing = await tx.paymentTransaction.findUnique({
                where: { idempotencyKey },
            });

            if (existing) {
                throwError("RETURN_REFUND_ALREADY_RECORDED", 409);
            }

            const amount = new Prisma.Decimal(request.refundAmount || 0);

            if (amount.lte(0)) {
                throwError("RETURN_REFUND_AMOUNT_INVALID", 409);
            }

            const transaction = await tx.paymentTransaction.create({
                data: {
                    paymentId: order.payment.id,
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
                        refundReference: input.refundReference,
                        confirmedAt: new Date().toISOString(),
                    },
                    providerTxnId: input.refundReference,
                    idempotencyKey,
                    isSuccessful: true,
                },
            });

            const priorRefunds = await tx.paymentTransaction.findMany({
                where: {
                    paymentId: order.payment.id,
                    type: "REFUND",
                    isSuccessful: true,
                    id: { not: transaction.id },
                },
                select: { requestData: true },
            });

            const totalRefunded = priorRefunds.reduce(
                (sum, item) => sum.add(
                    new Prisma.Decimal(item.requestData?.amount || 0)
                ),
                amount
            );

            const newPaymentStatus = totalRefunded.gte(order.payment.amount)
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED";

            const paymentUpdate = await tx.payment.updateMany({
                where: {
                    id: order.payment.id,
                    status: order.payment.status,
                },
                data: {
                    status: newPaymentStatus,
                },
            });

            if (paymentUpdate.count !== 1) {
                throwError("RETURN_CONCURRENT_UPDATE", 409);
            }

            await tx.returnItem.update({
                where: { id: request.items[0].id },
                data: { status: "COMPLETED" },
            });

            await tx.returnRequest.update({
                where: { id: request.id },
                data: {
                    status: "COMPLETED",
                    refundReference: input.refundReference,
                    processedById: adminId,
                    processedAt: new Date(),
                    adminNote: input.adminNote || "Đã xác nhận hoàn tiền thủ công",
                },
            });

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
};
