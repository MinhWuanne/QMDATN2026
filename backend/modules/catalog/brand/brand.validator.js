const { z } = require("zod");

const brandCreateSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên thương hiệu").max(120),
  slug: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  logoUrl: z.string().trim().url("URL logo không hợp lệ").nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const brandUpdateSchema = brandCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Vui lòng cung cấp ít nhất một trường cần cập nhật"
);

module.exports = {
  brandCreateSchema,
  brandUpdateSchema,
};
