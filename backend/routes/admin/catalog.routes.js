const express = require("express");

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

const router = express.Router();

router.use(authenticate, authorize("ADMIN"));

// Categories
router.get("/categories", categoryController.listCategories);
router.get("/categories/:id", categoryController.getCategory);
router.post("/categories", validate(categoryCreateSchema), categoryController.createCategory);
router.patch("/categories/:id", validate(categoryUpdateSchema), categoryController.updateCategory);

// Brands
router.get("/brands", brandController.listBrands);
router.get("/brands/:id", brandController.getBrand);
router.post("/brands", validate(brandCreateSchema), brandController.createBrand);
router.patch("/brands/:id", validate(brandUpdateSchema), brandController.updateBrand);

module.exports = router;
