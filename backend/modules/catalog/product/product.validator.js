
const { z } = require("zod");

const productStatus = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
// ==========================================
// PRODUCT IMAGE
// ==========================================

const productImageSchema = z.object({
    imageUrl: z.string()
        .url("Đường dẫn ảnh không hợp lệ"),

    publicId: z.string()
        .trim()
        .min(1, "Public ID không hợp lệ")
        .max(255)
        .nullable()
        .optional(),

    altText: z.string()
        .trim()
        .max(255)
        .nullable()
        .optional(),

    sortOrder: z.number()
        .int()
        .min(0),

    isPrimary: z.boolean(),
}).strict();

const productImagesSchema = z.array(productImageSchema)
    .superRefine((images, ctx) => {
        const primaryCount = images.filter(
            image => image.isPrimary
        ).length;

        if (images.length > 0 && primaryCount !== 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Mỗi nhóm ảnh phải có đúng một ảnh chính",
            });
        }
    });

const variantImagesUpdateSchema = z.array(
    z.object({
        variantId: z.string().uuid(),

        images: productImagesSchema,
    }).strict()
).superRefine((items, ctx) => {
    const ids = items.map((item) => item.variantId);

    if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Không được gửi trùng Variant",
        });
    }
});

// ==========================================
// PRODUCT VARIANT
// ==========================================

const variantSchema = z.object({
    name: z.string()
        .trim()
        .min(1, "Vui lòng nhập tên màu")
        .max(150),

    sku: z.string()
        .trim()
        .toUpperCase()
        .min(1, "Vui lòng nhập SKU")
        .max(80),

    attributes: z.object({
        color: z.string()
            .trim()
            .min(1, "Vui lòng nhập màu sắc")
            .max(50),
    }).strict(),

    images: productImagesSchema.optional(),

    weightGrams: z.number()
        .int()
        .positive()
        .nullable()
        .optional(),
}).strict();

const variantUpdateSchema = variantSchema
    .omit({ images: true })
    .partial()
    .refine(
        data => Object.keys(data).length > 0,
        "Vui lòng cung cấp ít nhất một trường cần cập nhật"
    );

// ==========================================
// PRODUCT CREATE
// ==========================================

const productCreateSchema = z.object({
    name: z.string()
        .trim()
        .min(1, "Vui lòng nhập tên sản phẩm")
        .max(200),

    slug: z.string()
        .trim()
        .min(1)
        .max(220)
        .optional(),

    description: z.string()
        .trim()
        .nullable()
        .optional(),

    categoryId: z.string()
        .uuid("Category ID không hợp lệ"),

    brandId: z.string()
        .uuid("Brand ID không hợp lệ")
        .nullable()
        .optional(),

    price: z.number()
        .finite()
        .positive("Giá sản phẩm phải lớn hơn 0")
        .max(999999999999.99)
        .refine(
            value => Number.isInteger(value * 100),
            "Giá sản phẩm chỉ được có tối đa 2 chữ số thập phân"
        ),

    images: productImagesSchema.optional(),

    status: productStatus.optional(),

    isFeatured: z.boolean().optional(),

    variants: z.array(variantSchema)
        .min(1, "Sản phẩm phải có ít nhất một biến thể màu"),
}).strict();

// ==========================================
// PRODUCT UPDATE
// ==========================================

const productUpdateSchema = z.object({
    name: z.string()
        .trim()
        .min(1)
        .max(200)
        .optional(),

    slug: z.string()
        .trim()
        .min(1)
        .max(220)
        .optional(),

    description: z.string()
        .trim()
        .nullable()
        .optional(),

    categoryId: z.string()
        .uuid()
        .optional(),

    brandId: z.string()
        .uuid()
        .nullable()
        .optional(),

    price: z.number()
        .finite()
        .positive()
        .max(999999999999.99)
        .refine(
            value => Number.isInteger(value * 100),
            "Giá sản phẩm chỉ được có tối đa 2 chữ số thập phân"
        )
        .optional(),

    status: productStatus.optional(),

    images: productImagesSchema.optional(),
    variantImages: variantImagesUpdateSchema.optional(),

    isFeatured: z.boolean().optional(),
}).strict().refine(
    data => Object.keys(data).length > 0,
    "Vui lòng cung cấp ít nhất một trường cần cập nhật"
);

// ==========================================
// PRODUCT STATUS UPDATE
// ==========================================

const productStatusUpdateSchema = z.object({
    status: productStatus,
}).strict();

// ==========================================
// PRODUCT LIST QUERY
// ==========================================

const productListQuerySchema = z.object({
    page: z.coerce.number()
        .int()
        .min(1)
        .optional(),

    limit: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .optional(),

    search: z.string()
        .trim()
        .max(200)
        .optional(),

    categoryId: z.string()
        .uuid()
        .optional(),

    brandId: z.string()
        .uuid()
        .optional(),

    status: productStatus.optional(),

    sortBy: z.enum([
        "createdAt",
        "name",
        "price",
    ]).optional(),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).optional(),
}).strict();

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    productCreateSchema,
    productUpdateSchema,
    productStatusUpdateSchema,
    productListQuerySchema,

    variantSchema,
    variantUpdateSchema,
};
