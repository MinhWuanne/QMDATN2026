const { z } = require("zod");

const discountTypeSchema = z.enum([
    "PERCENTAGE",
    "FIXED_AMOUNT",
]);

const voucherCodeSchema = z.string()
    .trim()
    .toUpperCase()
    .min(1, "Vui lòng nhập mã Voucher")
    .max(50, "Mã Voucher tối đa 50 ký tự")
    .regex(
        /^[A-Z0-9_-]+$/,
        "Mã Voucher chỉ được chứa chữ in hoa, số, dấu gạch ngang và gạch dưới"
    );

const positiveDecimalSchema = z.number()
    .finite()
    .positive();

const nonNegativeDecimalSchema = z.number()
    .finite()
    .nonnegative();

const dateSchema = z.coerce.date();

const voucherFieldsSchema = {
    code: voucherCodeSchema,

    description: z.string()
        .trim()
        .nullable()
        .optional(),

    discountType: discountTypeSchema,

    discountValue: positiveDecimalSchema,

    maxDiscount: positiveDecimalSchema
        .nullable()
        .optional(),

    minOrderAmount: nonNegativeDecimalSchema
        .default(0),

    usageLimit: z.number()
        .int()
        .positive()
        .nullable()
        .optional(),

    perUserLimit: z.number()
        .int()
        .positive()
        .default(1),

    startsAt: dateSchema,

    endsAt: dateSchema,

    isActive: z.boolean()
        .optional(),
};

function validateVoucherRules(data, ctx) {
    if (
        data.discountType === "PERCENTAGE" &&
        data.discountValue !== undefined &&
        data.discountValue > 100
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["discountValue"],
            message: "Phần trăm giảm giá không được vượt quá 100",
        });
    }

    if (
        data.startsAt instanceof Date &&
        data.endsAt instanceof Date &&
        data.endsAt <= data.startsAt
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endsAt"],
            message: "Thời gian kết thúc phải sau thời gian bắt đầu",
        });
    }
}

// ==========================================
// CREATE
// ==========================================

const voucherCreateSchema = z.object({
    ...voucherFieldsSchema,
}).strict().superRefine(validateVoucherRules);

// ==========================================
// UPDATE
// ==========================================

const voucherUpdateSchema = z.object({
    code: voucherCodeSchema.optional(),

    description: z.string()
        .trim()
        .nullable()
        .optional(),

    discountType: discountTypeSchema.optional(),

    discountValue: positiveDecimalSchema.optional(),

    maxDiscount: positiveDecimalSchema
        .nullable()
        .optional(),

    minOrderAmount: nonNegativeDecimalSchema.optional(),

    usageLimit: z.number()
        .int()
        .positive()
        .nullable()
        .optional(),

    perUserLimit: z.number()
        .int()
        .positive()
        .optional(),

    startsAt: dateSchema.optional(),

    endsAt: dateSchema.optional(),

    isActive: z.boolean().optional(),
}).strict().refine(
    (data) => Object.keys(data).length > 0,
    "Vui lòng cung cấp ít nhất một trường cần cập nhật"
).superRefine(validateVoucherRules);

// ==========================================
// STATUS
// ==========================================

const voucherStatusUpdateSchema = z.object({
    isActive: z.boolean(),
}).strict();

// ==========================================
// LIST QUERY
// ==========================================

const voucherListQuerySchema = z.object({
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

    discountType: discountTypeSchema.optional(),

    isActive: z.enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

    sortBy: z.enum([
        "createdAt",
        "code",
        "startsAt",
        "endsAt",
        "discountValue",
    ]).optional(),

    sortOrder: z.enum([
        "asc",
        "desc",
    ]).optional(),
}).strict();

// ==========================================
// PARAMS
// ==========================================

const voucherIdParamsSchema = z.object({
    id: z.string().uuid("Voucher ID không hợp lệ"),
}).strict();

module.exports = {
    voucherCreateSchema,
    voucherUpdateSchema,
    voucherStatusUpdateSchema,
    voucherListQuerySchema,
    voucherIdParamsSchema,
};