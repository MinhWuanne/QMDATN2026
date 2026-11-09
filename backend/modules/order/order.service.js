
const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../../core/database/prisma");

// ==========================================
// CONSTANTS
// ==========================================

const SHIPPING_FEE = new Prisma.Decimal(0);

const ORDER_STATUSES = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
];

const ALLOWED_TRANSITIONS = {
    PENDING_CONFIRMATION: ["CONFIRMED"],
    CONFIRMED: ["PROCESSING"],
    PROCESSING: ["SHIPPING"],
    SHIPPING: ["DELIVERED"],
    DELIVERED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
};

const ADMIN_CANCELLABLE_STATUSES = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPING",
];

const ORDER_INCLUDE = {
    items: {
        orderBy: { createdAt: "asc" },
    },
    payment: true,
    statusHistory: {
        orderBy: { createdAt: "asc" },
    },
    voucher: {
        select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
        },
    },
};

// ==========================================
// ERROR HELPERS
// ==========================================

function throwError(message, statusCode = 400) {
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

function handleOrderError(error) {
    if (error.code === "P2034") {
        throwError("ORDER_CONCURRENT_UPDATE", 409);
    }

    if (error.code === "P2002") {
        throwError("ORDER_CONFLICT", 409);
    }

    throw error;
}

function assertUuid(value, field = "id") {
    if (
        typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
        throwValidationError(field, "ID không hợp lệ");
    }
}

// ==========================================
// ORDER NUMBER
// ==========================================

function generateOrderNumber() {
    const date = new Date();

    const datePart = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("");

    const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

    return `ORD-${datePart}-${randomPart}`;
}

// ==========================================
// MONEY HELPERS
// ==========================================

function calculateVoucherDiscount(voucher, subtotal) {
    let discount = new Prisma.Decimal(0);

    if (voucher.discountType === "PERCENTAGE") {
        discount = subtotal
            .mul(voucher.discountValue)
            .div(100);
    } else if (voucher.discountType === "FIXED_AMOUNT") {
        discount = new Prisma.Decimal(voucher.discountValue);
    }

    if (voucher.maxDiscount !== null) {
        discount = Prisma.Decimal.min(
            discount,
            new Prisma.Decimal(voucher.maxDiscount)
        );
    }

    discount = Prisma.Decimal.min(discount, subtotal);

    return discount.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP
    );
}

// ==========================================
// VOUCHER VALIDATION
// ==========================================

async function validateVoucher(tx, { voucherCode, userId, subtotal }) {
    if (!voucherCode) {
        return null;
    }

    const normalizedCode = voucherCode.trim().toUpperCase();

    const voucher = await tx.voucher.findUnique({
        where: { code: normalizedCode },
    });

    if (!voucher) {
        throwError("VOUCHER_NOT_FOUND", 404);
    }

    const now = new Date();

    if (!voucher.isActive) {
        throwError("VOUCHER_INACTIVE", 409);
    }

    if (now < voucher.startsAt || now >= voucher.endsAt) {
        throwError("VOUCHER_OUTSIDE_VALID_PERIOD", 409);
    }

    if (subtotal.lt(voucher.minOrderAmount)) {
        throwError("VOUCHER_MIN_ORDER_AMOUNT_NOT_MET", 400);
    }

    const totalUsage = await tx.voucherUsage.count({
        where: { voucherId: voucher.id },
    });

    if (
        voucher.usageLimit !== null &&
        totalUsage >= voucher.usageLimit
    ) {
        throwError("VOUCHER_USAGE_LIMIT_REACHED", 409);
    }

    const userUsage = await tx.voucherUsage.count({
        where: {
            voucherId: voucher.id,
            userId,
        },
    });

    if (userUsage >= voucher.perUserLimit) {
        throwError("VOUCHER_USER_LIMIT_REACHED", 409);
    }

    return {
        voucher,
        discountAmount: calculateVoucherDiscount(voucher, subtotal),
    };
}

// ==========================================
// CART VALIDATION
// ==========================================

async function getValidatedCart(tx, userId) {
    const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
            items: {
                include: {
                    variant: {
                        include: {
                            product: true,
                            inventory: true,
                        },
                    },
                },
            },
        },
    });

    if (!cart || cart.items.length === 0) {
        throwError("CART_EMPTY", 400);
    }

    const validatedItems = [];

    for (const cartItem of cart.items) {
        const variant = cartItem.variant;
        const product = variant.product;
        const inventory = variant.inventory;

        if (product.status !== "ACTIVE") {
            throwError("PRODUCT_NOT_AVAILABLE", 409);
        }

        if (!variant.isActive) {
            throwError("PRODUCT_VARIANT_INACTIVE", 409);
        }

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        const availableQuantity =
            inventory.quantityOnHand - inventory.reservedQuantity;

        if (availableQuantity < cartItem.quantity) {
            throwError("INSUFFICIENT_STOCK", 409);
        }

        const unitPrice = new Prisma.Decimal(product.price);
        const lineTotal = unitPrice.mul(cartItem.quantity);

        validatedItems.push({
            cartItemId: cartItem.id,
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
            variantAttributes: variant.attributes,
            quantity: cartItem.quantity,
            unitPrice,
            lineTotal,
            inventory,
        });
    }

    return { cart, items: validatedItems };
}

// Restore eligible order items to customer's cart after cancellation.
async function restoreOrderItemsToCart(tx, order) {
    if (!order?.userId || !Array.isArray(order.items)) {
        throwError("INVALID_ORDER_DATA", 400);
    }

    const cart = await tx.cart.upsert({
        where: {
            userId: order.userId,
        },
        create: {
            userId: order.userId,
        },
        update: {},
    });

    for (const item of order.items) {
        const variant = await tx.productVariant.findFirst({
            where: {
                id: item.variantId,
                isActive: true,
                product: {
                    is: {
                        status: "ACTIVE",
                    },
                },
            },
            select: {
                id: true,
            },
        });

        // Do not restore products or variants that are no longer sellable.
        if (!variant) continue;

        await tx.cartItem.upsert({
            where: {
                cartId_variantId: {
                    cartId: cart.id,
                    variantId: item.variantId,
                },
            },
            create: {
                cartId: cart.id,
                variantId: item.variantId,
                quantity: item.quantity,
            },
            update: {
                quantity: {
                    increment: item.quantity,
                },
            },
        });
    }

    return cart;
}


// ==========================================
// INVENTORY HELPERS
// ==========================================

// Reserve stock at order creation.
// Database condition guarantees:
// quantityOnHand - reservedQuantity >= requested quantity.

async function reserveInventory(tx, items) {
    for (const item of items) {
        const inventory = item.inventory;

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                AND: [
                    {
                        quantityOnHand: inventory.quantityOnHand,
                    },
                    {
                        reservedQuantity: inventory.reservedQuantity,
                    },
                    {
                        quantityOnHand: {
                            gte: inventory.reservedQuantity + item.quantity,
                        },
                    },
                ],
            },
            data: {
                reservedQuantity: {
                    increment: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("INSUFFICIENT_STOCK_OR_CONCURRENT_UPDATE", 409);
        }
    }
}

// Release reserved stock before confirmation.
// Database guarantees reservedQuantity cannot become negative.

async function releaseReservedInventory(tx, item) {
    const inventory = await tx.inventory.findUnique({
        where: { variantId: item.variantId },
    });

    if (!inventory) {
        throwError("INVENTORY_NOT_FOUND", 404);
    }

    const result = await tx.inventory.updateMany({
        where: {
            id: inventory.id,
            reservedQuantity: {
                gte: item.quantity,
            },
        },
        data: {
            reservedQuantity: {
                decrement: item.quantity,
            },
        },
    });

    if (result.count !== 1) {
        throwError("INVENTORY_RESERVATION_INCONSISTENT", 409);
    }
}

// Confirm order: reduce both on-hand and reserved stock.
// Create SALE movement.

async function deductReservedInventory(tx, order, adminId) {
    for (const item of order.items) {
        const inventory = await tx.inventory.findUnique({
            where: { variantId: item.variantId },
        });

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        if (
            inventory.quantityOnHand < item.quantity ||
            inventory.reservedQuantity < item.quantity
        ) {
            throwError("INVENTORY_RESERVATION_INCONSISTENT", 409);
        }

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                AND: [
                    {
                        quantityOnHand: inventory.quantityOnHand,
                    },
                    {
                        reservedQuantity: inventory.reservedQuantity,
                    },
                    {
                        quantityOnHand: {
                            gte: item.quantity,
                        },
                    },
                    {
                        reservedQuantity: {
                            gte: item.quantity,
                        },
                    },
                ],
            },
            data: {
                quantityOnHand: {
                    decrement: item.quantity,
                },
                reservedQuantity: {
                    decrement: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("ORDER_CONCURRENT_UPDATE", 409);
        }

        await tx.inventoryMovement.create({
            data: {
                variantId: item.variantId,
                type: "SALE",
                quantity: item.quantity,
                beforeStock: inventory.quantityOnHand,
                afterStock: inventory.quantityOnHand - item.quantity,
                referenceId: order.id,
                note: `Stock deducted for order ${order.orderNumber}`,
                createdBy: adminId,
            },
        });
    }
}

// Restore on-hand stock after an already-confirmed order is cancelled.

async function restoreSoldInventory(tx, order, actorId) {
    for (const item of order.items) {
        const inventory = await tx.inventory.findUnique({
            where: { variantId: item.variantId },
        });

        if (!inventory) {
            throwError("INVENTORY_NOT_FOUND", 404);
        }

        const result = await tx.inventory.updateMany({
            where: {
                id: inventory.id,
                quantityOnHand: inventory.quantityOnHand,
                reservedQuantity: inventory.reservedQuantity,
            },
            data: {
                quantityOnHand: {
                    increment: item.quantity,
                },
            },
        });

        if (result.count !== 1) {
            throwError("ORDER_CONCURRENT_UPDATE", 409);
        }

        await tx.inventoryMovement.create({
            data: {
                variantId: item.variantId,
                type: "ORDER_CANCEL",
                quantity: item.quantity,
                beforeStock: inventory.quantityOnHand,
                afterStock: inventory.quantityOnHand + item.quantity,
                referenceId: order.id,
                note: `Stock restored after cancelling order ${order.orderNumber}`,
                createdBy: actorId,
            },
        });
    }
}


// ==========================================
// ORDER HISTORY
// ==========================================

async function createOrderHistory(
    tx,
    { orderId, changedById, oldStatus, newStatus, note }
) {
    await tx.orderStatusHistory.create({
        data: {
            orderId,
            changedById: changedById || null,
            oldStatus: oldStatus || null,
            newStatus,
            note: note || null,
        },
    });
}

// ==========================================
// CREATE ORDER
// ==========================================

async function createOrder(userId, input) {
    assertUuid(userId, "userId");

    const {
        paymentMethod,
        voucherCode,
        shippingRecipientName,
        shippingPhone,
        shippingProvinceCity,
        shippingDistrict,
        shippingStreet,
        shippingAddressNote,
        customerNote,
    } = input;

    if (!["COD", "VNPAY"].includes(paymentMethod)) {
        throwValidationError(
            "paymentMethod",
            "Phương thức thanh toán không hợp lệ"
        );
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const { cart, items } = await getValidatedCart(tx, userId);

                const subtotal = items.reduce(
                    (total, item) => total.add(item.lineTotal),
                    new Prisma.Decimal(0)
                );

                const voucherResult = await validateVoucher(tx, {
                    voucherCode,
                    userId,
                    subtotal,
                });

                const voucher = voucherResult?.voucher || null;

                const discountAmount = voucherResult
                    ? voucherResult.discountAmount
                    : new Prisma.Decimal(0);

                const totalAmount = subtotal
                    .sub(discountAmount)
                    .add(SHIPPING_FEE);

                if (totalAmount.lt(0)) {
                    throwError("INVALID_ORDER_TOTAL", 400);
                }

                await reserveInventory(tx, items);

                const order = await tx.order.create({
                    data: {
                        orderNumber: generateOrderNumber(),
                        userId,
                        voucherId: voucher?.id || null,
                        status: "PENDING_CONFIRMATION",
                        paymentMethod,
                        subtotal,
                        discountAmount,
                        shippingFee: SHIPPING_FEE,
                        totalAmount,

                        shippingRecipientName,
                        shippingPhone,
                        shippingProvinceCity,
                        shippingDistrict,
                        shippingStreet,
                        shippingAddressNote: shippingAddressNote || null,
                        customerNote: customerNote || null,

                        items: {
                            create: items.map((item) => ({
                                productId: item.productId,
                                variantId: item.variantId,
                                productName: item.productName,
                                variantName: item.variantName,
                                sku: item.sku,
                                variantAttributes: item.variantAttributes,
                                unitPrice: item.unitPrice,
                                quantity: item.quantity,
                                lineTotal: item.lineTotal,
                            })),
                        },
                    },
                });

                await tx.payment.create({
                    data: {
                        orderId: order.id,
                        method: paymentMethod,
                        status: "PENDING",
                        amount: totalAmount,
                    },
                });

                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: null,
                    oldStatus: null,
                    newStatus: "PENDING_CONFIRMATION",
                    note: "Order created by customer",
                });

                if (voucher) {
                    await tx.voucherUsage.create({
                        data: {
                            voucherId: voucher.id,
                            userId,
                            orderId: order.id,
                            discountAmount,
                        },
                    });
                }

                await tx.cartItem.deleteMany({
                    where: { cartId: cart.id },
                });

                return tx.order.findUnique({
                    where: { id: order.id },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// CUSTOMER: LIST ORDERS
// ==========================================

// ==========================================
// START VNPAY CHECKOUT
// ==========================================

async function startCheckout(orderId, userId) {
    assertUuid(orderId, "orderId");
    assertUuid(userId, "userId");

    return prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
            where: {
                id: orderId,
                userId,
            },
            include: {
                payment: true,
            },
        });

        if (!order) {
            throwError("ORDER_NOT_FOUND", 404);
        }

        if (order.paymentMethod !== "VNPAY") {
            throwError("CHECKOUT_NOT_REQUIRED", 409);
        }

        if (order.status !== "PENDING_CONFIRMATION") {
            throwError("ORDER_NOT_AVAILABLE_FOR_CHECKOUT", 409);
        }

        if (!order.payment) {
            throwError("PAYMENT_NOT_FOUND", 404);
        }

        if (order.payment.method !== "VNPAY") {
            throwError("PAYMENT_METHOD_MISMATCH", 409);
        }

        if (order.payment.status !== "PENDING") {
            throwError("PAYMENT_NOT_PENDING", 409);
        }

        const now = new Date();

        // Không gia hạn phiên checkout đã bắt đầu.
        if (order.payment.checkoutStartedAt) {
            if (
                !order.payment.expiresAt ||
                order.payment.expiresAt <= now
            ) {
                throwError("PAYMENT_SESSION_EXPIRED", 409);
            }
        } else {
            const expiresAt = new Date(
                now.getTime() + 10 * 60 * 1000
            );

            // Atomic update: chỉ một request được khởi tạo phiên.
            const result = await tx.payment.updateMany({
                where: {
                    id: order.payment.id,
                    status: "PENDING",
                    checkoutStartedAt: null,
                },
                data: {
                    checkoutStartedAt: now,
                    expiresAt,
                },
            });

            let payment;

            if (result.count === 1) {
                payment = await tx.payment.findUnique({
                    where: {
                        id: order.payment.id,
                    },
                });
            } else {
                // Một request khác có thể đã khởi tạo phiên trước.
                payment = await tx.payment.findUnique({
                    where: {
                        id: order.payment.id,
                    },
                });
            }

            if (
                !payment ||
                !payment.checkoutStartedAt ||
                !payment.expiresAt
            ) {
                throwError("CHECKOUT_SESSION_INITIALIZATION_FAILED", 409);
            }

            if (payment.expiresAt <= new Date()) {
                throwError("PAYMENT_SESSION_EXPIRED", 409);
            }

            order.payment = payment;
        }

        const remainingSeconds = Math.max(
            0,
            Math.ceil(
                (order.payment.expiresAt.getTime() - Date.now()) / 1000
            )
        );

        return {
            orderId: order.id,
            paymentId: order.payment.id,
            paymentMethod: order.payment.method,
            paymentStatus: order.payment.status,
            checkoutStartedAt: order.payment.checkoutStartedAt,
            expiresAt: order.payment.expiresAt,
            remainingSeconds,
        };
    });
}

async function expirePendingVnpayOrders() {

    const scanTime = new Date();

    const expiredPayments = await prisma.payment.findMany({
        where: {
            method: "VNPAY",
            status: "PENDING",
            checkoutStartedAt: { not: null },
            expiresAt: { lte: scanTime },
            order: {
                is: {
                    paymentMethod: "VNPAY",
                    status: "PENDING_CONFIRMATION",
                },
            },
        },
        select: {
            id: true,
        },
        orderBy: {
            expiresAt: "asc",
        },
        take: 100,
    });

    let expiredCount = 0;

    for (const candidate of expiredPayments) {
        try {
            const now = new Date();

            const expired = await prisma.$transaction(
                async (tx) => {
                    const payment = await tx.payment.findUnique({
                        where: { id: candidate.id },
                        include: {
                            order: {
                                include: {
                                    items: true,
                                },
                            },
                        },
                    });

                    if (
                        !payment ||
                        payment.method !== "VNPAY" ||
                        payment.status !== "PENDING" ||
                        !payment.expiresAt ||
                        payment.expiresAt > now ||
                        !payment.order ||
                        payment.order.paymentMethod !== "VNPAY" ||
                        payment.order.status !== "PENDING_CONFIRMATION"
                    ) {
                        return false;
                    }

                    // Step 1: Claim the expired payment using CAS.
                    const paymentResult = await tx.payment.updateMany({
                        where: {
                            id: payment.id,
                            method: "VNPAY",
                            status: "PENDING",
                            expiresAt: { lte: now },
                        },
                        data: {
                            status: "CANCELLED",
                        },
                    });

                    if (paymentResult.count !== 1) {
                        return false;
                    }

                    // Step 2: Cancel the order using CAS.
                    const orderResult = await tx.order.updateMany({
                        where: {
                            id: payment.order.id,
                            paymentMethod: "VNPAY",
                            status: "PENDING_CONFIRMATION",
                        },
                        data: {
                            status: "CANCELLED",
                            cancelledAt: now,
                        },
                    });

                    if (orderResult.count !== 1) {
                        // Roll back the payment update as well.
                        const error = new Error("VNPAY_EXPIRY_ORDER_RACE");
                        error.code = "VNPAY_EXPIRY_ORDER_RACE";
                        throw error;
                    }

                    // Step 3: Release reserved inventory.
                    for (const item of payment.order.items) {
                        await releaseReservedInventory(tx, item);
                    }

                    // Step 4: Restore eligible items to the cart.
                    await restoreOrderItemsToCart(tx, payment.order);

                    // Step 5: Record order history.
                    await createOrderHistory(tx, {
                        orderId: payment.order.id,
                        changedById: null,
                        oldStatus: "PENDING_CONFIRMATION",
                        newStatus: "CANCELLED",
                        note: "VNPAY checkout expired after 10 minutes",
                    });

                    // Step 6: Release voucher usage.
                    await tx.voucherUsage.deleteMany({
                        where: {
                            orderId: payment.order.id,
                        },
                    });

                    return true;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                }
            );

            if (expired) {
                expiredCount++;
            }
        } catch (error) {
            if (
                error.code === "VNPAY_EXPIRY_ORDER_RACE" ||
                error.code === "P2034"
            ) {
                continue;
            }

            throw error;
        }
    }

    return {
        scanned: expiredPayments.length,
        expired: expiredCount,
    };
}

async function listMyOrders(userId, query = {}) {
    assertUuid(userId, "userId");

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
        userId,
        ...(query.status ? { status: query.status } : {}),
    };

    const [orders, total] = await prisma.$transaction([
        prisma.order.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
                items: true,
                payment: true,
            },
        }),
        prisma.order.count({ where }),
    ]);

    return {
        data: orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// CUSTOMER: GET ORDER DETAIL
// ==========================================

async function getMyOrderById(userId, orderId) {
    assertUuid(userId, "userId");
    assertUuid(orderId, "orderId");

    const order = await prisma.order.findFirst({
        where: {
            id: orderId,
            userId,
        },
        include: ORDER_INCLUDE,
    });

    if (!order) {
        throwError("ORDER_NOT_FOUND", 404);
    }

    return order;
}

// ==========================================
// CUSTOMER: CANCEL ORDER
// Only PENDING_CONFIRMATION
// ==========================================


async function cancelMyOrder(userId, orderId, note = null) {
    assertUuid(userId, "userId");
    assertUuid(orderId, "orderId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findFirst({
                    where: {
                        id: orderId,
                        userId,
                    },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                // Only COD and unpaid VNPAY orders can use normal cancellation.
                if (!["COD", "VNPAY"].includes(order.paymentMethod)) {
                    throwError("UNSUPPORTED_PAYMENT_METHOD", 409);
                }

                // Paid orders must go through customer service and refund.
                if (order.payment?.status === "PAID") {
                    throwError("PAID_ORDER_REQUIRES_REFUND", 409);
                }

                const allowedStatuses =
                    order.paymentMethod === "COD"
                        ? [
                            "PENDING_CONFIRMATION",
                            "CONFIRMED",
                            "PROCESSING",
                            "SHIPPING",
                        ]
                        : ["PENDING_CONFIRMATION"];

                if (!allowedStatuses.includes(order.status)) {
                    throwError("ORDER_CANNOT_BE_CANCELLED", 409);
                }

                if (
                    order.payment?.status !== "PENDING" &&
                    order.payment?.status !== "FAILED"
                ) {
                    throwError("PAYMENT_CANNOT_BE_CANCELLED", 409);
                }

                // Step 1: Cancel order using compare-and-set.
                const result = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: new Date(),
                    },
                });

                if (result.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Step 2: Restore inventory according to order lifecycle.
                if (order.status === "PENDING_CONFIRMATION") {
                    // Stock was reserved but not deducted.
                    for (const item of order.items) {
                        await releaseReservedInventory(tx, item);
                    }
                } else {
                    // Stock was already deducted after confirmation.
                    // userId is valid because InventoryMovement.createdBy
                    // references User, not exclusively Admin.
                    await restoreSoldInventory(tx, order, userId);
                }

                // Step 3: Restore eligible items to customer's cart.
                await restoreOrderItemsToCart(tx, order);

                // Step 4: Create order status history.
                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: userId,
                    oldStatus: order.status,
                    newStatus: "CANCELLED",
                    note: note || "Cancelled by customer",
                });

                // Step 5: Release voucher usage.
                await tx.voucherUsage.deleteMany({
                    where: {
                        orderId: order.id,
                    },
                });

                // Step 6: Cancel unpaid payment.
                if (
                    order.payment &&
                    ["PENDING", "FAILED"].includes(order.payment.status)
                ) {
                    await tx.payment.updateMany({
                        where: {
                            id: order.payment.id,
                            status: order.payment.status,
                        },
                        data: {
                            status: "CANCELLED",
                        },
                    });
                }

                return tx.order.findUnique({
                    where: {
                        id: order.id,
                    },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}


// ==========================================
// ADMIN: LIST ORDERS
// ==========================================

async function listAdminOrders(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.paymentMethod
            ? { paymentMethod: query.paymentMethod }
            : {}),
        ...(query.paymentStatus
            ? { payment: { is: { status: query.paymentStatus } } }
            : {}),
        ...(query.search
            ? {
                OR: [
                    {
                        orderNumber: {
                            contains: query.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        shippingRecipientName: {
                            contains: query.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        shippingPhone: {
                            contains: query.search,
                        },
                    },
                ],
            }
            : {}),
    };

    const [orders, total] = await prisma.$transaction([
        prisma.order.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: query.sortOrder || "desc",
            },
            include: {
                items: true,
                payment: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                    },
                },
            },
        }),
        prisma.order.count({ where }),
    ]);

    return {
        data: orders,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// ADMIN: GET ORDER DETAIL
// ==========================================

async function getAdminOrderById(orderId) {
    assertUuid(orderId, "orderId");

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            ...ORDER_INCLUDE,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    phone: true,
                },
            },
            voucherUsage: true,
        },
    });

    if (!order) {
        throwError("ORDER_NOT_FOUND", 404);
    }

    return order;
}

// ==========================================
// ADMIN: MARK COD PAID
// ==========================================

async function markOrderPaid(orderId, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: { payment: true },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (order.paymentMethod !== "COD") {
                    throwError("COD_PAYMENT_METHOD_REQUIRED", 409);
                }

                if (order.status !== "DELIVERED") {
                    throwError("COD_PAYMENT_REQUIRES_DELIVERED_ORDER", 409);
                }

                if (!order.payment) {
                    throwError("PAYMENT_NOT_FOUND", 404);
                }

                if (order.payment.status === "PAID") {
                    throwError("PAYMENT_ALREADY_PAID", 409);
                }

                if (order.payment.status !== "PENDING") {
                    throwError("PAYMENT_CANNOT_BE_MARKED_PAID", 409);
                }

                const paymentResult = await tx.payment.updateMany({
                    where: {
                        id: order.payment.id,
                        status: "PENDING",
                    },
                    data: {
                        status: "PAID",
                        paidAt: new Date(),
                    },
                });

                if (paymentResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                await tx.paymentTransaction.create({
                    data: {
                        paymentId: order.payment.id,
                        type: "QUERY",
                        requestData: {
                            source: "ADMIN_COD_CONFIRMATION",
                            orderId: order.id,
                            adminId,
                        },
                        responseData: {
                            result: "PAID",
                            note: note || null,
                        },
                        idempotencyKey: `COD-${order.id}-${crypto.randomUUID()}`,
                        isSuccessful: true,
                    },
                });

                return tx.payment.findUnique({
                    where: { id: order.payment.id },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// ADMIN: UPDATE ORDER STATUS
// ==========================================

async function updateOrderStatus(orderId, newStatus, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    if (!ORDER_STATUSES.includes(newStatus)) {
        throwValidationError("status", "Trạng thái đơn hàng không hợp lệ");
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (!order.payment) {
                    throwError("PAYMENT_NOT_FOUND", 404);
                }

                if (
                    order.paymentMethod === "VNPAY" &&
                    order.payment.status !== "PAID"
                ) {
                    throwError("ORDER_PAYMENT_NOT_PAID", 409);
                }

                if (
                    order.paymentMethod === "COD" &&
                    newStatus === "COMPLETED" &&
                    order.payment.status !== "PAID"
                ) {
                    throwError("COD_PAYMENT_NOT_COLLECTED", 409);
                }

                if (
                    !["COD", "VNPAY"].includes(order.paymentMethod)
                ) {
                    throwError("UNSUPPORTED_PAYMENT_METHOD", 409);
                }

                const allowedNextStatuses =
                    ALLOWED_TRANSITIONS[order.status] || [];

                if (!allowedNextStatuses.includes(newStatus)) {
                    throwError("INVALID_ORDER_STATUS_TRANSITION", 409);
                }

                const updateResult = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: newStatus,
                        ...(newStatus === "COMPLETED"
                            ? { completedAt: new Date() }
                            : {}),
                    },
                });

                if (updateResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Deduct stock only when moving from
                // PENDING_CONFIRMATION to CONFIRMED.
                if (
                    order.status === "PENDING_CONFIRMATION" &&
                    newStatus === "CONFIRMED"
                ) {
                    await deductReservedInventory(tx, order, adminId);
                }


                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: adminId,
                    oldStatus: order.status,
                    newStatus,
                    note: note || null,
                });

                return tx.order.findUnique({
                    where: { id: order.id },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// ADMIN: CANCEL ORDER
// Before SHIPPING only.
// Paid payment remains PAID until refund succeeds.
// ==========================================

async function cancelAdminOrder(orderId, adminId, note = null) {
    assertUuid(orderId, "orderId");
    assertUuid(adminId, "adminId");

    try {
        return await prisma.$transaction(
            async (tx) => {
                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        items: true,
                        payment: true,
                    },
                });

                if (!order) {
                    throwError("ORDER_NOT_FOUND", 404);
                }

                if (
                    !ADMIN_CANCELLABLE_STATUSES.includes(order.status)
                ) {
                    throwError("ORDER_CANNOT_BE_CANCELLED", 409);
                }

                // Paid orders require a successful refund before cancellation.
                if (order.payment?.status === "PAID") {
                    throwError("PAID_ORDER_REQUIRES_REFUND", 409);
                }

                // Step 1: Update order status using compare-and-set (CAS).
                const updateResult = await tx.order.updateMany({
                    where: {
                        id: order.id,
                        status: order.status,
                    },
                    data: {
                        status: "CANCELLED",
                        cancelledAt: new Date(),
                    },
                });

                if (updateResult.count !== 1) {
                    throwError("ORDER_CONCURRENT_UPDATE", 409);
                }

                // Step 2: Release or restore inventory.
                if (order.status === "PENDING_CONFIRMATION") {
                    // Stock was reserved but not deducted.
                    for (const item of order.items) {
                        await releaseReservedInventory(tx, item);
                    }
                } else if (
                    ["CONFIRMED", "PROCESSING", "SHIPPING"].includes(order.status)
                ) {
                    // Stock was already deducted at confirmation.
                    await restoreSoldInventory(tx, order, adminId);
                }

                // Step 3: Create order status history.
                await createOrderHistory(tx, {
                    orderId: order.id,
                    changedById: adminId,
                    oldStatus: order.status,
                    newStatus: "CANCELLED",
                    note: note || "Cancelled by admin",
                });

                // Step 4: Remove voucher usage.
                await tx.voucherUsage.deleteMany({
                    where: { orderId: order.id },
                });

                // Step 5: Cancel pending payment.
                if (order.payment?.status === "PENDING") {
                    await tx.payment.update({
                        where: { id: order.payment.id },
                        data: { status: "CANCELLED" },
                    });
                }

                return tx.order.findUnique({
                    where: { id: order.id },
                    include: ORDER_INCLUDE,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleOrderError(error);
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    createOrder,

    listMyOrders,
    getMyOrderById,
    cancelMyOrder,

    listAdminOrders,
    getAdminOrderById,
    markOrderPaid,
    updateOrderStatus,
    cancelAdminOrder,
    startCheckout,
    expirePendingVnpayOrders,
};
