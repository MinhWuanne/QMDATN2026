
const prisma = require("../../../core/database/prisma");
const {
    toSlug,
    assertUuid,
} = require("../shared/catalog.utils");

const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"];

const cloudinary = require("../../../core/cloudinary");

function throwValidationError(field, message) {
    const error = new Error("VALIDATION_ERROR");
    error.details = [{ field, message }];
    throw error;
}

function normalizeSlug(value) {
    const slug = toSlug(value);

    if (!slug) {
        throwValidationError("slug", "Slug không hợp lệ");
    }

    return slug;
}

function handleProductError(error) {
    if (error.code === "P2002") {
        const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join("_")
            : String(error.meta?.target || "");

        if (target.includes("slug")) {
            throw new Error("PRODUCT_SLUG_EXISTS");
        }

        if (target.includes("sku")) {
            throw new Error("PRODUCT_SKU_EXISTS");
        }

        throw new Error("PRODUCT_CONFLICT");
    }

    throw error;
}

async function assertCategoryAndBrand(tx, categoryId, brandId) {
    const category = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true, isActive: true },
    });

    if (!category) throw new Error("CATEGORY_NOT_FOUND");
    if (!category.isActive) throw new Error("CATEGORY_INACTIVE");

    if (brandId) {
        const brand = await tx.brand.findUnique({
            where: { id: brandId },
            select: { id: true, isActive: true },
        });

        if (!brand) throw new Error("BRAND_NOT_FOUND");
        if (!brand.isActive) throw new Error("BRAND_INACTIVE");
    }
}

async function deleteCloudinaryImages(publicIds) {
    const uniqueIds = [...new Set(
        publicIds.filter((publicId) => typeof publicId === "string" && publicId.trim())
    )];

    const results = await Promise.allSettled(
        uniqueIds.map((publicId) =>
            cloudinary.uploader.destroy(publicId, {
                resource_type: "image",
                invalidate: true,
            })
        )
    );

    const failedIds = results
        .map((result, index) =>
            result.status === "rejected" ? uniqueIds[index] : null
        )
        .filter(Boolean);

    if (failedIds.length > 0) {
        console.error("Không thể xóa một số ảnh Cloudinary:", failedIds);
    }
}

function buildProductWhere(filters = {}) {
    return {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
        ...(filters.search
            ? {
                OR: [
                    {
                        name: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        slug: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        variants: {
                            some: {
                                sku: {
                                    contains: filters.search,
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                ],
            }
            : {}),
    };
}

// ==========================================
// LIST PRODUCTS
// ==========================================

async function listProducts(query = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const allowedSortFields = ["createdAt", "name", "price"];
    const sortBy = allowedSortFields.includes(query.sortBy)
        ? query.sortBy
        : "createdAt";

    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

    const where = buildProductWhere(query);

    const [products, total] = await prisma.$transaction([
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
            include: {
                category: {
                    select: { id: true, name: true, slug: true },
                },
                brand: {
                    select: { id: true, name: true, slug: true },
                },
                images: {
                    where: {
                        variantId: null,
                        isPrimary: true,
                    },
                    take: 1,
                    select: {
                        id: true,
                        imageUrl: true,
                        altText: true,
                    },
                },
                variants: {
                    where: { isActive: true },
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        images: {
                            orderBy: [
                                { isPrimary: "desc" },
                                { sortOrder: "asc" },
                                { createdAt: "asc" },
                            ],
                            take: 1,
                            select: {
                                id: true,
                                imageUrl: true,
                                altText: true,
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
        }),
        prisma.product.count({ where }),
    ]);

    const items = products.map((product) => {
        const totalStock = product.variants.reduce((total, variant) => {
            const inventory = variant.inventory;

            return total + (
                inventory
                    ? inventory.quantityOnHand - inventory.reservedQuantity
                    : 0
            );
        }, 0);

        return {
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            status: product.status,
            isFeatured: product.isFeatured,
            category: product.category,
            brand: product.brand,
            primaryImage:
                product.images[0] ??
                product.variants.find((variant) => variant.images.length > 0)?.images[0] ??
                null,
            variantCount: product.variants.length,
            totalStock,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
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
// GET PRODUCT DETAIL
// ==========================================

async function getProductById(id) {
    assertUuid(id);

    const product = await prisma.product.findUnique({
        where: { id },
        include: {
            category: true,
            brand: true,
            images: {
                where: {
                    variantId: null,
                },
                orderBy: [
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                ],
            },
            variants: {
                orderBy: { createdAt: "asc" },
                include: {
                    inventory: true,
                    images: {
                        orderBy: [
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                        ],
                    },
                },
            },
            _count: {
                select: {
                    orderItems: true,
                    reviews: true,
                },
            },
        },
    });

    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    return product;
}

// ==========================================
// CREATE PRODUCT + VARIANTS + INVENTORY
// ==========================================


// ==========================================
// CREATE PRODUCT + VARIANTS + INVENTORY + IMAGES
// ==========================================

async function createProduct(input) {
    const slug = normalizeSlug(input.slug || input.name);

    const skus = input.variants.map((variant) => variant.sku);

    if (new Set(skus).size !== skus.length) {
        throwValidationError(
            "variants",
            "SKU của các biến thể không được trùng nhau"
        );
    }

    try {
        return await prisma.$transaction(async (tx) => {
            await assertCategoryAndBrand(
                tx,
                input.categoryId,
                input.brandId ?? null
            );

            // 1. Tạo Product, ảnh Product, Variants và Inventory
            const product = await tx.product.create({
                data: {
                    name: input.name,
                    slug,
                    description: input.description ?? null,
                    categoryId: input.categoryId,
                    brandId: input.brandId ?? null,
                    price: input.price,
                    status: input.status ?? "DRAFT",
                    isFeatured: input.isFeatured ?? false,

                    images: input.images?.length
                        ? {
                            create: input.images.map((image) => ({
                                imageUrl: image.imageUrl,
                                publicId: image.publicId ?? null,
                                altText: image.altText ?? null,
                                sortOrder: image.sortOrder,
                                isPrimary: image.isPrimary,
                            })),
                        }
                        : undefined,

                    variants: {
                        create: input.variants.map((variant) => ({
                            name: variant.name,
                            sku: variant.sku,
                            attributes: variant.attributes,

                            inventory: {
                                create: {
                                    quantityOnHand: 0,
                                    reservedQuantity: 0,
                                },
                            },
                        })),
                    },
                },
                include: {
                    variants: true,
                },
            });

            // 2. Tạo ảnh Variant sau khi đã có ID của Product và Variant
            const variantImages = [];

            product.variants.forEach((createdVariant, index) => {
                const images = input.variants[index].images || [];

                images.forEach((image) => {
                    variantImages.push({
                        productId: product.id,
                        variantId: createdVariant.id,
                        imageUrl: image.imageUrl,
                        publicId: image.publicId ?? null,
                        altText: image.altText ?? null,
                        sortOrder: image.sortOrder,
                        isPrimary: image.isPrimary,
                    });
                });
            });

            if (variantImages.length > 0) {
                await tx.productImage.createMany({
                    data: variantImages,
                });
            }

            // 3. Trả về Product đầy đủ thông tin
            return await tx.product.findUnique({
                where: {
                    id: product.id,
                },
                include: {
                    category: true,
                    brand: true,
                    images: {
                        orderBy: [
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                        ],
                    },
                    variants: {
                        include: {
                            inventory: true,
                            images: {
                                orderBy: [
                                    { sortOrder: "asc" },
                                    { createdAt: "asc" },
                                ],
                            },
                        },
                    },
                },
            });
        });
    } catch (error) {
        handleProductError(error);
    }
}


// ==========================================
// UPDATE PRODUCT INFORMATION
// ==========================================


async function updateProduct(id, input) {
    assertUuid(id);

    const {
        images,
        variantImages,
        ...productData
    } = input;

    const data = {};

    if (productData.name !== undefined) data.name = productData.name;
    if (productData.slug !== undefined) {
        data.slug = normalizeSlug(productData.slug);
    }
    if (productData.description !== undefined) {
        data.description = productData.description;
    }
    if (productData.categoryId !== undefined) {
        data.categoryId = productData.categoryId;
    }
    if (productData.brandId !== undefined) {
        data.brandId = productData.brandId;
    }
    if (productData.price !== undefined) {
        data.price = productData.price;
    }

    if (productData.status !== undefined) {
        data.status = productData.status;
    }
    if (productData.isFeatured !== undefined) {
        data.isFeatured = productData.isFeatured;
    }

    try {
        // Lưu các publicId cần xóa sau khi transaction thành công.
        let oldPublicIds = [];

        const updatedProduct = await prisma.$transaction(async (tx) => {
            const existing = await tx.product.findUnique({
                where: { id },
                select: {
                    id: true,
                    categoryId: true,
                    brandId: true,
                },
            });

            if (!existing) {
                throw new Error("PRODUCT_NOT_FOUND");
            }

            if (
                productData.categoryId !== undefined ||
                productData.brandId !== undefined
            ) {
                await assertCategoryAndBrand(
                    tx,
                    productData.categoryId ?? existing.categoryId,
                    productData.brandId !== undefined
                        ? productData.brandId
                        : existing.brandId
                );
            }

            await tx.product.update({
                where: { id },
                data,
            });

            // Các publicId mới được giữ lại, tránh xóa nhầm ảnh
            // vẫn còn được sử dụng trong payload cập nhật.
            const newPublicIds = new Set([
                ...(images ?? []).map((image) => image.publicId),
                ...(variantImages ?? []).flatMap((item) =>
                    item.images.map((image) => image.publicId)
                ),
            ].filter(Boolean));

            // Chỉ thay ảnh Product khi request có trường images.
            if (images !== undefined) {
                const oldImages = await tx.productImage.findMany({
                    where: {
                        productId: id,
                        variantId: null,
                    },
                    select: {
                        publicId: true,
                    },
                });

                oldPublicIds.push(
                    ...oldImages.map((image) => image.publicId)
                );

                await tx.productImage.deleteMany({
                    where: {
                        productId: id,
                        variantId: null,
                    },
                });

                if (images.length > 0) {
                    await tx.productImage.createMany({
                        data: images.map((image) => ({
                            productId: id,
                            variantId: null,
                            imageUrl: image.imageUrl,
                            publicId: image.publicId,
                            altText: image.altText ?? null,
                            sortOrder: image.sortOrder,
                            isPrimary: image.isPrimary,
                        })),
                    });
                }
            }

            // Cập nhật ảnh từng Variant.
            if (variantImages !== undefined) {
                const variantIds = variantImages.map(
                    (item) => item.variantId
                );

                if (new Set(variantIds).size !== variantIds.length) {
                    throwValidationError(
                        "variantImages",
                        "Không được gửi trùng Variant"
                    );
                }

                for (const item of variantImages) {
                    const variant = await tx.productVariant.findFirst({
                        where: {
                            id: item.variantId,
                            productId: id,
                        },
                        select: { id: true },
                    });

                    if (!variant) {
                        throwValidationError(
                            "variantImages",
                            "Variant không thuộc sản phẩm này"
                        );
                    }

                    const oldImages = await tx.productImage.findMany({
                        where: {
                            productId: id,
                            variantId: item.variantId,
                        },
                        select: {
                            publicId: true,
                        },
                    });

                    oldPublicIds.push(
                        ...oldImages.map((image) => image.publicId)
                    );

                    await tx.productImage.deleteMany({
                        where: {
                            productId: id,
                            variantId: item.variantId,
                        },
                    });

                    if (item.images.length > 0) {
                        await tx.productImage.createMany({
                            data: item.images.map((image) => ({
                                productId: id,
                                variantId: item.variantId,
                                imageUrl: image.imageUrl,
                                publicId: image.publicId,
                                altText: image.altText ?? null,
                                sortOrder: image.sortOrder,
                                isPrimary: image.isPrimary,
                            })),
                        });
                    }
                }
            }

            return tx.product.findUnique({
                where: { id },
                include: {
                    category: true,
                    brand: true,
                    images: {
                        where: { variantId: null },
                        orderBy: [
                            { sortOrder: "asc" },
                            { createdAt: "asc" },
                        ],
                    },
                    variants: {
                        include: {
                            inventory: true,
                            images: {
                                orderBy: [
                                    { sortOrder: "asc" },
                                    { createdAt: "asc" },
                                ],
                            },
                        },
                    },
                },
            });
        });

        // Transaction đã commit thành công mới xóa ảnh trên Cloudinary.
        // Không xóa những publicId vẫn còn được sử dụng.
        const retainedPublicIds = new Set([
            ...(images ?? []).map((image) => image.publicId),
            ...(variantImages ?? []).flatMap((item) =>
                item.images.map((image) => image.publicId)
            ),
        ].filter(Boolean));

        const publicIdsToDelete = oldPublicIds.filter(
            (publicId) => publicId && !retainedPublicIds.has(publicId)
        );

        await deleteCloudinaryImages(publicIdsToDelete);

        return updatedProduct;
    } catch (error) {
        handleProductError(error);
    }
}


// ==========================================
// UPDATE PRODUCT STATUS
// ==========================================

async function updateProductStatus(id, status) {
    assertUuid(id);

    if (!PRODUCT_STATUSES.includes(status)) {
        throwValidationError("status", "Trạng thái sản phẩm không hợp lệ");
    }

    return await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
            where: { id },
        });

        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        if (product.status === "ARCHIVED") {
            throw new Error("PRODUCT_ARCHIVED");
        }

        if (status === "ACTIVE") {
            const activeVariantCount = await tx.productVariant.count({
                where: {
                    productId: id,
                    isActive: true,
                },
            });

            if (activeVariantCount === 0) {
                throw new Error("PRODUCT_NO_ACTIVE_VARIANTS");
            }
        }

        return tx.product.update({
            where: { id },
            data: { status },
        });
    });
}

// ==========================================
// ARCHIVE PRODUCT
// ==========================================

async function archiveProduct(id) {
    assertUuid(id);

    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
            where: { id },
            select: { id: true, status: true },
        });

        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        if (product.status === "ARCHIVED") {
            throw new Error("PRODUCT_ALREADY_ARCHIVED");
        }

        return tx.product.update({
            where: { id },
            data: { status: "ARCHIVED" },
        });
    });
}

// ==========================================
// ADD PRODUCT VARIANT + INVENTORY
// ==========================================

async function addProductVariant(productId, input) {
    assertUuid(productId);

    try {
        return await prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({
                where: { id: productId },
                select: { id: true, status: true },
            });

            if (!product) throw new Error("PRODUCT_NOT_FOUND");

            if (product.status === "ARCHIVED") {
                throw new Error("PRODUCT_ARCHIVED");
            }

            return tx.productVariant.create({
                data: {
                    productId,
                    name: input.name,
                    sku: input.sku,
                    attributes: input.attributes,
                    weightGrams: input.weightGrams ?? null,
                    isActive: true,
                    inventory: {
                        create: {
                            quantityOnHand: 0,
                            reservedQuantity: 0,
                        },
                    },
                },
                include: {
                    inventory: true,
                },
            });
        });
    } catch (error) {
        handleProductError(error);
    }
}

// ==========================================
// UPDATE PRODUCT VARIANT
// ==========================================

async function updateProductVariant(productId, variantId, input) {
    assertUuid(productId);
    assertUuid(variantId);

    try {
        return await prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({
                where: { id: productId },
                select: { id: true, status: true },
            });

            if (!product) throw new Error("PRODUCT_NOT_FOUND");

            if (product.status === "ARCHIVED") {
                throw new Error("PRODUCT_ARCHIVED");
            }

            const variant = await tx.productVariant.findFirst({
                where: {
                    id: variantId,
                    productId,
                },
            });

            if (!variant) throw new Error("PRODUCT_VARIANT_NOT_FOUND");

            if (!variant.isActive) {
                throw new Error("PRODUCT_VARIANT_INACTIVE");
            }

            return tx.productVariant.update({
                where: { id: variantId },
                data: input,
                include: {
                    inventory: true,
                },
            });
        });
    } catch (error) {
        handleProductError(error);
    }
}

// ==========================================
// DEACTIVATE PRODUCT VARIANT
// ==========================================

async function deactivateProductVariant(productId, variantId) {
    assertUuid(productId);
    assertUuid(variantId);

    return await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
            where: { id: productId },
            select: { id: true, status: true },
        });

        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        if (product.status === "ARCHIVED") {
            throw new Error("PRODUCT_ARCHIVED");
        }

        const variant = await tx.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
        });

        if (!variant) throw new Error("PRODUCT_VARIANT_NOT_FOUND");

        if (!variant.isActive) {
            throw new Error("PRODUCT_VARIANT_ALREADY_INACTIVE");
        }

        if (product.status === "ACTIVE") {
            const activeVariantCount = await tx.productVariant.count({
                where: {
                    productId,
                    isActive: true,
                },
            });

            if (activeVariantCount <= 1) {
                throw new Error("PRODUCT_LAST_ACTIVE_VARIANT");
            }
        }

        // Xóa biến thể khỏi tất cả giỏ hàng đang tham chiếu
        await tx.cartItem.deleteMany({
            where: {
                variantId,
            },
        });

        return tx.productVariant.update({
            where: { id: variantId },
            data: { isActive: false },
            include: {
                inventory: true,
            },
        });
    });
}

module.exports = {
    listProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateProductStatus,
    archiveProduct,
    addProductVariant,
    updateProductVariant,
    deactivateProductVariant,
};
