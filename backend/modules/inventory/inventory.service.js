
const { Prisma } = require("@prisma/client");
const prisma = require("../../core/database/prisma");

// ==========================================
// CONSTANTS
// ==========================================

const LOW_STOCK_THRESHOLD = 5;

// ==========================================
// HELPERS
// ==========================================

function assertUuid(value) {
    if (
        typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ) {
        throw new Error("INVALID_ID");
    }
}

function throwValidationError(field, message) {
    const error = new Error("VALIDATION_ERROR");
    error.details = [{ field, message }];
    throw error;
}

function handleInventoryError(error) {
    if (error.code === "P2034") {
        const concurrentError = new Error("INVENTORY_CONCURRENT_UPDATE");
        concurrentError.code = "INVENTORY_CONCURRENT_UPDATE";
        throw concurrentError;
    }

    throw error;
}

function getAvailableQuantity(inventory) {
    return inventory.quantityOnHand - inventory.reservedQuantity;
}

function getStockStatus(availableQuantity) {
    if (availableQuantity <= 0) return "OUT_OF_STOCK";
    if (availableQuantity <= LOW_STOCK_THRESHOLD) return "LOW_STOCK";
    return "IN_STOCK";
}

function mapInventoryItem(inventory) {
    const availableQuantity = getAvailableQuantity(inventory);
    const variant = inventory.variant;
    const product = variant.product;

    return {
        id: inventory.id,
        variantId: inventory.variantId,

        quantityOnHand: inventory.quantityOnHand,
        reservedQuantity: inventory.reservedQuantity,
        availableQuantity,
        stockStatus: getStockStatus(availableQuantity),

        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,

        variant: {
            id: variant.id,
            sku: variant.sku,
            name: variant.name,
            attributes: variant.attributes,
            isActive: variant.isActive,
        },

        product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            status: product.status,
            categoryId: product.categoryId,
            brandId: product.brandId,
        },
    };
}

function buildInventoryOrderBy(sortBy, sortOrder) {
    switch (sortBy) {
        case "quantityOnHand":
            return { quantityOnHand: sortOrder };

        case "reservedQuantity":
            return { reservedQuantity: sortOrder };

        case "sku":
            return {
                variant: {
                    sku: sortOrder,
                },
            };

        case "productName":
            return {
                variant: {
                    product: {
                        name: sortOrder,
                    },
                },
            };

        case "updatedAt":
        default:
            return { updatedAt: sortOrder };
    }
}

function buildInventoryWhere({
    search,
    categoryId,
    brandId,
}) {
    return {
        variant: {
            isActive: true,

            product: {
                status: {
                    not: "ARCHIVED",
                },

                ...(categoryId ? { categoryId } : {}),
                ...(brandId ? { brandId } : {}),

                ...(search
                    ? {
                        OR: [
                            {
                                name: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                slug: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        ],
                    }
                    : {}),
            },

            ...(search
                ? {
                    OR: [
                        {
                            sku: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                        {
                            name: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    ],
                }
                : {}),
        },
    };
}

async function getActiveVariant(tx, variantId) {
    const variant = await tx.productVariant.findUnique({
        where: {
            id: variantId,
        },
        select: {
            id: true,
            sku: true,
            isActive: true,
            product: {
                select: {
                    id: true,
                    status: true,
                },
            },
        },
    });

    if (!variant) {
        throw new Error("PRODUCT_VARIANT_NOT_FOUND");
    }

    if (!variant.isActive) {
        throw new Error("PRODUCT_VARIANT_INACTIVE");
    }

    if (variant.product.status === "ARCHIVED") {
        throw new Error("PRODUCT_ARCHIVED");
    }

    return variant;
}

async function getInventoryRecord(tx, variantId) {
    const inventory = await tx.inventory.findUnique({
        where: {
            variantId,
        },
    });

    if (!inventory) {
        throw new Error("INVENTORY_NOT_FOUND");
    }

    return inventory;
}

async function updateStockAndCreateMovement(tx, {
    inventory,
    quantityOnHand,
    movementType,
    movementQuantity,
    note,
    createdBy,
}) {
    const updated = await tx.inventory.updateMany({
        where: {
            id: inventory.id,
            quantityOnHand: inventory.quantityOnHand,
            reservedQuantity: inventory.reservedQuantity,
        },
        data: {
            quantityOnHand,
        },
    });

    if (updated.count !== 1) {
        throw new Error("INVENTORY_CONCURRENT_UPDATE");
    }

    const movement = await tx.inventoryMovement.create({
        data: {
            variantId: inventory.variantId,
            type: movementType,
            quantity: movementQuantity,
            beforeStock: inventory.quantityOnHand,
            afterStock: quantityOnHand,
            note: note ?? null,
            createdBy: createdBy ?? null,
        },
    });

    return {
        inventory: {
            id: inventory.id,
            variantId: inventory.variantId,
            beforeStock: inventory.quantityOnHand,
            quantityOnHand,
            reservedQuantity: inventory.reservedQuantity,
            availableQuantity:
                quantityOnHand - inventory.reservedQuantity,
        },
        movement,
    };
}

// ==========================================
// LIST INVENTORY
// ==========================================

async function listInventory(query = {}) {
    const {
        page = 1,
        limit = 20,
        search,
        stockStatus,
        categoryId,
        brandId,
        sortBy = "updatedAt",
        sortOrder = "desc",
    } = query;

    const where = buildInventoryWhere({
        search,
        categoryId,
        brandId,
    });

    // Khi lọc theo stockStatus hoặc sắp xếp theo availableQuantity,
    // cần tính quantityOnHand - reservedQuantity.
    // Prisma không hỗ trợ trực tiếp phép so sánh hai cột trong
    // where/orderBy thông thường, nên xử lý riêng trường hợp này.

    const needsComputedFilter =
        Boolean(stockStatus) || sortBy === "availableQuantity";

    if (needsComputedFilter) {
        const inventories = await prisma.inventory.findMany({
            where,
            include: {
                variant: {
                    select: {
                        id: true,
                        sku: true,
                        name: true,
                        attributes: true,
                        isActive: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                status: true,
                                categoryId: true,
                                brandId: true,
                            },
                        },
                    },
                },
            },
            orderBy: buildInventoryOrderBy(
                sortBy === "availableQuantity" ? "updatedAt" : sortBy,
                sortOrder
            ),
        });

        let items = inventories.map(mapInventoryItem);

        if (stockStatus) {
            items = items.filter(
                item => item.stockStatus === stockStatus
            );
        }

        if (sortBy === "availableQuantity") {
            items.sort((a, b) => {
                return sortOrder === "asc"
                    ? a.availableQuantity - b.availableQuantity
                    : b.availableQuantity - a.availableQuantity;
            });
        }

        const total = items.length;
        const skip = (page - 1) * limit;

        return {
            items: items.slice(skip, skip + limit),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // Trường hợp thông thường: lọc, sắp xếp và phân trang tại database.
    const skip = (page - 1) * limit;

    const [inventories, total] = await prisma.$transaction([
        prisma.inventory.findMany({
            where,
            skip,
            take: limit,
            orderBy: buildInventoryOrderBy(sortBy, sortOrder),
            include: {
                variant: {
                    select: {
                        id: true,
                        sku: true,
                        name: true,
                        attributes: true,
                        isActive: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                status: true,
                                categoryId: true,
                                brandId: true,
                            },
                        },
                    },
                },
            },
        }),

        prisma.inventory.count({
            where,
        }),
    ]);

    return {
        items: inventories.map(mapInventoryItem),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// GET INVENTORY DETAIL
// ==========================================

async function getInventoryByVariantId(variantId) {
    assertUuid(variantId);

    const inventory = await prisma.inventory.findUnique({
        where: {
            variantId,
        },
        include: {
            variant: {
                select: {
                    id: true,
                    sku: true,
                    name: true,
                    attributes: true,
                    isActive: true,
                    product: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            status: true,
                            categoryId: true,
                            brandId: true,
                        },
                    },
                },
            },
        },
    });

    if (!inventory) {
        throw new Error("INVENTORY_NOT_FOUND");
    }

    return mapInventoryItem(inventory);
}

// ==========================================
// LIST INVENTORY MOVEMENTS
// ==========================================

async function listInventoryMovements(variantId, query = {}) {
    assertUuid(variantId);

    const {
        page = 1,
        limit = 20,
        type,
        sortOrder = "desc",
    } = query;

    await getInventoryRecord(prisma, variantId);

    const where = {
        variantId,
        ...(type ? { type } : {}),
    };

    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
        prisma.inventoryMovement.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                createdAt: sortOrder,
            },
            include: {
                actor: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                    },
                },
            },
        }),

        prisma.inventoryMovement.count({
            where,
        }),
    ]);

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
// PURCHASE INVENTORY
// ==========================================

async function purchaseInventory(input, createdBy) {
    assertUuid(input.variantId);

    if (createdBy) {
        assertUuid(createdBy);
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                await getActiveVariant(tx, input.variantId);

                const inventory = await getInventoryRecord(
                    tx,
                    input.variantId
                );

                const beforeStock = inventory.quantityOnHand;
                const afterStock = beforeStock + input.quantity;

                if (!Number.isSafeInteger(afterStock)) {
                    throwValidationError(
                        "quantity",
                        "Số lượng tồn kho vượt giới hạn cho phép"
                    );
                }

                return updateStockAndCreateMovement(tx, {
                    inventory,
                    quantityOnHand: afterStock,
                    movementType: "PURCHASE",
                    movementQuantity: input.quantity,
                    note: input.note,
                    createdBy,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleInventoryError(error);
    }
}

// ==========================================
// ADJUST INVENTORY
// ==========================================

async function adjustInventory(input, createdBy) {
    assertUuid(input.variantId);

    if (createdBy) {
        assertUuid(createdBy);
    }

    try {
        return await prisma.$transaction(
            async (tx) => {
                await getActiveVariant(tx, input.variantId);

                const inventory = await getInventoryRecord(
                    tx,
                    input.variantId
                );

                const beforeStock = inventory.quantityOnHand;
                const afterStock = input.actualStock;

                const difference = afterStock - beforeStock;

                if (afterStock < inventory.reservedQuantity) {
                    throwValidationError(
                        "actualStock",
                        "Tồn kho thực tế không được thấp hơn số lượng đang giữ chỗ"
                    );
                }

                if (difference === 0) {
                    return {
                        unchanged: true,
                        inventory: {
                            id: inventory.id,
                            variantId: inventory.variantId,
                            beforeStock,
                            quantityOnHand: beforeStock,
                            reservedQuantity: inventory.reservedQuantity,
                            availableQuantity:
                                beforeStock - inventory.reservedQuantity,
                        },
                        movement: null,
                    };
                }

                return updateStockAndCreateMovement(tx, {
                    inventory,
                    quantityOnHand: afterStock,
                    movementType: "ADJUSTMENT",
                    movementQuantity: difference,
                    note: input.note,
                    createdBy,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleInventoryError(error);
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    listInventory,
    getInventoryByVariantId,
    listInventoryMovements,
    purchaseInventory,
    adjustInventory,
};
