const express = require("express");

const controller = require("./customer-catalog.controller");

const {
    validateListQuery,
    validateIdentifier,
} = require("./customer-catalog.validator");

const router = express.Router();

// ==========================================
// CUSTOMER / STOREFRONT CATALOG
// Public read-only endpoints.
// ==========================================

// GET /api/catalog/products
router.get(
    "/products",
    validateListQuery,
    controller.listProducts
);

// GET /api/catalog/products/:identifier
// identifier có thể là product id hoặc slug.
router.get(
    "/products/:identifier",
    validateIdentifier,
    controller.getProduct
);

// GET /api/catalog/categories
router.get(
    "/categories",
    controller.listCategories
);

// GET /api/catalog/brands
router.get(
    "/brands",
    controller.listBrands
);

module.exports = router;