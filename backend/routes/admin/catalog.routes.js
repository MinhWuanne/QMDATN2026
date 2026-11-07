
const express = require("express");
const multer = require("multer");

const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");

const categoryController = require("../../modules/catalog/category/category.controller");
const {
    categoryCreateSchema,
    categoryUpdateSchema,
} = require("../../modules/catalog/category/category.validator");

const brandController = require("../../modules/catalog/brand/brand.controller");
const {
    brandCreateSchema,
    brandUpdateSchema,
} = require("../../modules/catalog/brand/brand.validator");

const productController = require("../../modules/catalog/product/product.controller");
const {
    productCreateSchema,
    productUpdateSchema,
    productStatusUpdateSchema,
    productListQuerySchema,
    variantSchema,
    variantUpdateSchema,
} = require("../../modules/catalog/product/product.validator");

const { uploadCatalogImage } = require("../../modules/catalog/catalog-upload.controller");

const router = express.Router();

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter(req, file, callback) {
        const allowedMimeTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return callback(new Error("INVALID_IMAGE_TYPE"));
        }

        callback(null, true);
    },
});

const inventoryController = require("../../modules/inventory/inventory.controller");

const {
    inventoryListQuerySchema,
    inventoryVariantParamsSchema,
    inventoryMovementQuerySchema,
    inventoryPurchaseSchema,
    inventoryAdjustmentSchema,
} = require("../../modules/inventory/inventory.validator");

// All catalog management routes require an admin.
router.use(authenticate, authorize("ADMIN"));

// ==========================================
// CATALOG IMAGE UPLOAD
// ==========================================

router.post(
    "/images/:type",
    (req, res, next) => {
        imageUpload.single("image")(req, res, (error) => {
            if (!error) return next();

            if (
                error instanceof multer.MulterError &&
                error.code === "LIMIT_FILE_SIZE"
            ) {
                return res.status(400).json({
                    success: false,
                    message: "IMAGE_TOO_LARGE",
                });
            }

            return res.status(400).json({
                success: false,
                message: error.message === "INVALID_IMAGE_TYPE"
                    ? "INVALID_IMAGE_TYPE"
                    : "IMAGE_UPLOAD_INVALID",
            });
        });
    },
    uploadCatalogImage
);

// ==========================================
// CATEGORIES
// ==========================================

router.get("/categories", categoryController.listCategories);
router.get("/categories/:id", categoryController.getCategory);

router.post(
    "/categories",
    validate(categoryCreateSchema),
    categoryController.createCategory
);

router.patch(
    "/categories/:id",
    validate(categoryUpdateSchema),
    categoryController.updateCategory
);

router.delete("/categories/:id", categoryController.deleteCategory);

// ==========================================
// BRANDS
// ==========================================

router.get("/brands", brandController.listBrands);
router.get("/brands/:id", brandController.getBrand);

router.post(
    "/brands",
    validate(brandCreateSchema),
    brandController.createBrand
);

router.patch(
    "/brands/:id",
    validate(brandUpdateSchema),
    brandController.updateBrand
);

router.delete("/brands/:id", brandController.deleteBrand);

// ==========================================
// PRODUCTS
// ==========================================

router.get(
    "/products",
    validate(productListQuerySchema, "query"),
    productController.listProducts
);

router.get(
    "/products/:id",
    productController.getProduct
);

router.post(
    "/products",
    validate(productCreateSchema),
    productController.createProduct
);

router.patch(
    "/products/:id",
    validate(productUpdateSchema),
    productController.updateProduct
);

router.patch(
    "/products/:id/status",
    validate(productStatusUpdateSchema),
    productController.updateProductStatus
);

router.delete(
    "/products/:id",
    productController.archiveProduct
);

// ==========================================
// PRODUCT VARIANTS
// ==========================================

router.post(
    "/products/:id/variants",
    validate(variantSchema),
    productController.addProductVariant
);

router.patch(
    "/products/:id/variants/:variantId",
    validate(variantUpdateSchema),
    productController.updateProductVariant
);

router.delete(
    "/products/:id/variants/:variantId",
    productController.deactivateProductVariant
);

// ==========================================
// INVENTORY
// ==========================================

// GET /inventory
router.get(
    "/inventory",
    validate(inventoryListQuerySchema, "query"),
    inventoryController.listInventory
);

// GET /inventory/:variantId
router.get(
    "/inventory/:variantId",
    validate(inventoryVariantParamsSchema, "params"),
    inventoryController.getInventoryByVariantId
);

// GET /inventory/:variantId/movements
router.get(
    "/inventory/:variantId/movements",
    validate(inventoryVariantParamsSchema, "params"),
    validate(inventoryMovementQuerySchema, "query"),
    inventoryController.listInventoryMovements
);

// POST /inventory/purchase
router.post(
    "/inventory/purchase",
    validate(inventoryPurchaseSchema),
    inventoryController.purchaseInventory
);

// POST /inventory/adjustment
router.post(
    "/inventory/adjustment",
    validate(inventoryAdjustmentSchema),
    inventoryController.adjustInventory
);

module.exports = router;
