const { z } = require("zod");

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên danh mục").max(120),
  slug: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  imageUrl: z.string().trim().url("URL hình ảnh không hợp lệ").nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).strict();

const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Vui lòng cung cấp ít nhất một trường cần cập nhật"
);

module.exports = {
  categoryCreateSchema,
  categoryUpdateSchema,
};
