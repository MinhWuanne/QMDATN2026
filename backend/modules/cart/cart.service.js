
const { Prisma } = require("@prisma/client");
const prisma = require("../../core/database/prisma");

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

function handleCartError(error) {
    if (error.code === "P2034") {
        throwError("CART_CONCURRENT_UPDATE", 409);
    }

    if (error.code === "P2002") {
        throwError("CART_CONFLICT", 409);
    }

    throw error;
}

// ==========================================
// CART HELPERS
// ==========================================

async function getOrCreateCart(tx, userId) {
    return tx.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
}

function getAvailableQuantity(inventory) {
    if (!inventory) {
        return 0;
    }

    return Math.max(
        0,
        inventory.quantityOnHand - inventory.reservedQuantity
    );
}

function validateQuantity(quantity) {
    if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
    ) {
        throwValidationError(
            "quantity",
            "Số lượng phải là số nguyên từ 1 đến 99."
        );
    }
}

async function getCartData(tx, userId) {
    const cart = await getOrCreateCart(tx, userId);

    const items = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        orderBy: { createdAt: "asc" },
        include: {
            variant: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    attributes: true,
                    weightGrams: true,
                    isActive: true,
                    product: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            price: true,
                            status: true,
                            images: {
                                where: {
                                    variantId: null,
                                },
                                orderBy: [
                                    { isPrimary: "desc" },
                                    { sortOrder: "asc" },
                                ],
                                select: {
                                    id: true,
                                    imageUrl: true,
                                    altText: true,
                                    sortOrder: true,
                                    isPrimary: true,
                                },
                            },
                        },
                    },
                    images: {
                        orderBy: [
                            { isPrimary: "desc" },
                            { sortOrder: "asc" },
                        ],
                        select: {
                            id: true,
                            imageUrl: true,
                            altText: true,
                            sortOrder: true,
                            isPrimary: true,
                        },
                    },
                    inventory: {
                        select: {
                            quantityOnHand: true,
                            reservedQuantity: true,
                        },
                    },
                },
            },
        },
    });

    const mappedItems = items.map((item) => {
        const product = item.variant.product;
        const inventory = item.variant.inventory;

        const variantImages = item.variant.images || [];
        const productImages = product.images || [];

        const images = variantImages.length > 0
            ? variantImages
            : productImages;

        const availableQuantity = getAvailableQuantity(inventory);
        const unitPrice = new Prisma.Decimal(product.price);
        const lineTotal = unitPrice.mul(item.quantity);

        return {
            id: item.id,
            variantId: item.variantId,
            quantity: item.quantity,

            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                status: product.status,
                images,
            },

            variant: {
                id: item.variant.id,
                name: item.variant.name,
                sku: item.variant.sku,
                attributes: item.variant.attributes,
                weightGrams: item.variant.weightGrams,
                isActive: item.variant.isActive,
            },

            availableQuantity,
            inStock:
                product.status === "ACTIVE" &&
                item.variant.isActive &&
                availableQuantity > 0,

            lineTotal,
        };
    });

    const subtotal = mappedItems.reduce(
        (total, item) => total.add(item.lineTotal),
        new Prisma.Decimal(0)
    );

    return {
        id: cart.id,
        items: mappedItems,
        itemCount: mappedItems.length,
        totalQuantity: mappedItems.reduce(
            (total, item) => total + item.quantity,
            0
        ),
        subtotal,
    };
}

// ==========================================
// GET CART
// ==========================================

async function getCart(userId) {
    return prisma.$transaction(async (tx) => {
        return getCartData(tx, userId);
    });
}

// ==========================================
// ADD ITEM
// ==========================================

async function addItem(userId, { variantId, quantity }) {
    validateQuantity(quantity);

    try {
        return await prisma.$transaction(
            async (tx) => {
                const variant = await tx.productVariant.findUnique({
                    where: { id: variantId },
                    select: {
                        id: true,
                        isActive: true,
                        product: {
                            select: {
                                status: true,
                            },
                        },
                        inventory: {
                            select: {
                                quantityOnHand: true,
                                reservedQuantity: true,
                            },
                        },
                    },
                });

                if (!variant) {
                    throwError("PRODUCT_VARIANT_NOT_FOUND", 404);
                }

                if (
                    !variant.isActive ||
                    variant.product.status !== "ACTIVE"
                ) {
                    throwError("PRODUCT_VARIANT_INACTIVE", 409);
                }

                const availableQuantity = getAvailableQuantity(
                    variant.inventory
                );

                const cart = await getOrCreateCart(tx, userId);

                const existingItem = await tx.cartItem.findUnique({
                    where: {
                        cartId_variantId: {
                            cartId: cart.id,
                            variantId,
                        },
                    },
                });

                const newQuantity =
                    (existingItem?.quantity || 0) + quantity;

                if (newQuantity > availableQuantity) {
                    throwError("CART_INSUFFICIENT_STOCK", 409);
                }

                await tx.cartItem.upsert({
                    where: {
                        cartId_variantId: {
                            cartId: cart.id,
                            variantId,
                        },
                    },
                    create: {
                        cartId: cart.id,
                        variantId,
                        quantity,
                    },
                    update: {
                        quantity: newQuantity,
                    },
                });

                return getCartData(tx, userId);
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleCartError(error);
    }
}

// ==========================================
// UPDATE ITEM QUANTITY
// ==========================================

async function updateItem(userId, itemId, quantity) {
    validateQuantity(quantity);

    try {
        return await prisma.$transaction(
            async (tx) => {
                const cart = await getOrCreateCart(tx, userId);

                const item = await tx.cartItem.findFirst({
                    where: {
                        id: itemId,
                        cartId: cart.id,
                    },
                    include: {
                        variant: {
                            select: {
                                isActive: true,
                                product: {
                                    select: {
                                        status: true,
                                    },
                                },
                                inventory: {
                                    select: {
                                        quantityOnHand: true,
                                        reservedQuantity: true,
                                    },
                                },
                            },
                        },
                    },
                });

                if (!item) {
                    throwError("CART_ITEM_NOT_FOUND", 404);
                }

                if (
                    !item.variant.isActive ||
                    item.variant.product.status !== "ACTIVE"
                ) {
                    throwError("PRODUCT_VARIANT_INACTIVE", 409);
                }

                const availableQuantity = getAvailableQuantity(
                    item.variant.inventory
                );

                if (quantity > availableQuantity) {
                    throwError("CART_INSUFFICIENT_STOCK", 409);
                }

                await tx.cartItem.update({
                    where: { id: itemId },
                    data: { quantity },
                });

                return getCartData(tx, userId);
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleCartError(error);
    }
}

// ==========================================
// REMOVE ITEM
// ==========================================

async function removeItem(userId, itemId) {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (!cart) {
        throwError("CART_ITEM_NOT_FOUND", 404);
    }

    const result = await prisma.cartItem.deleteMany({
        where: {
            id: itemId,
            cartId: cart.id,
        },
    });

    if (result.count === 0) {
        throwError("CART_ITEM_NOT_FOUND", 404);
    }

    return getCart(userId);
}

// ==========================================
// CLEAR CART
// ==========================================

async function clearCart(userId) {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        select: { id: true },
    });

    if (cart) {
        await prisma.cartItem.deleteMany({
            where: { cartId: cart.id },
        });
    }

    return getCart(userId);
}

module.exports = {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
};
