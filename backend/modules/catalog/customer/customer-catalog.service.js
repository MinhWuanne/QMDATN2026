const prisma = require("../../../core/database/prisma");

const PRODUCT_CARD_SELECT = {
    id: true,
    name: true,
    slug: true,
    description: true,
    price: true,
    isFeatured: true,
    createdAt: true,

    category: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },

    brand: {
        select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
        },
    },

    images: {
        where: { variantId: null },
        orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
        ],
        select: {
            id: true,
            imageUrl: true,
            altText: true,
            sortOrder: true,
            isPrimary: true,
        },
    },

    variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            name: true,
            attributes: true,
            weightGrams: true,
            images: {
                orderBy: [
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
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
};

function buildPublicProductWhere(filters = {}) {
    const where = {
        status: "ACTIVE",
        category: { isActive: true },
        variants: {
            some: { isActive: true },
        },
    };

    if (filters.categoryId) {
        where.categoryId = filters.categoryId;
    }

    if (filters.brandId) {
        where.brandId = filters.brandId;
        where.brand = { isActive: true };
    } else {
        where.OR = [
            { brandId: null },
            { brand: { isActive: true } },
        ];
    }

    if (filters.search) {
        where.AND = [{
            OR: [
                { name: { contains: filters.search, mode: "insensitive" } },
                { description: { contains: filters.search, mode: "insensitive" } },
                { slug: { contains: filters.search, mode: "insensitive" } },
            ],
        }];
    }

    if (filters.featured !== undefined) {
        where.isFeatured = filters.featured;
    }

    return where;
}

function mapPublicProduct(product) {
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        isFeatured: product.isFeatured,
        createdAt: product.createdAt,
        category: product.category,
        brand: product.brand,
        images: product.images,
        variants: product.variants.map((variant) => {
            const inventory = variant.inventory;
            const availableQuantity = inventory
                ? Math.max(0, inventory.quantityOnHand - inventory.reservedQuantity)
                : 0;

            return {
                id: variant.id,
                name: variant.name,
                attributes: variant.attributes,
                weightGrams: variant.weightGrams,
                images: variant.images,
                inStock: availableQuantity > 0,
                availableQuantity,
            };
        }),
    };
}

async function listProducts(query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 12;
    const skip = (page - 1) * limit;
    const where = buildPublicProductWhere(query);

    const [products, total] = await prisma.$transaction([
        prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                [query.sortBy || "createdAt"]: query.sortOrder || "desc",
            },
            select: PRODUCT_CARD_SELECT,
        }),
        prisma.product.count({ where }),
    ]);

    return {
        data: products.map(mapPublicProduct),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}


async function getProductByIdentifier(identifier) {
    const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(identifier);

    const product = await prisma.product.findFirst({
        where: {
            AND: [
                isUuid
                    ? { id: identifier }
                    : { slug: identifier },
                buildPublicProductWhere(),
            ],
        },
        select: PRODUCT_CARD_SELECT,
    });

    if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
    }

    return mapPublicProduct(product);
}


async function listCategories() {
    return prisma.category.findMany({
        where: {
            isActive: true,
            products: {
                some: buildPublicProductWhere(),
            },
        },
        orderBy: [
            { sortOrder: "asc" },
            { name: "asc" },
        ],
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            imageUrl: true,
            sortOrder: true,
        },
    });
}

async function listBrands() {
    return prisma.brand.findMany({
        where: {
            isActive: true,
            products: {
                some: buildPublicProductWhere(),
            },
        },
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            logoUrl: true,
        },
    });
}

module.exports = {
    listProducts,
    getProductByIdentifier,
    listCategories,
    listBrands,
};
