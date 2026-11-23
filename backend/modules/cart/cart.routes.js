
const express = require("express");

const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const controller = require("./cart.controller");

const {
    validateUuidParam,
    validateAddItem,
    validateUpdateItem,
} = require("./cart.validator");

const router = express.Router();

// Tất cả Cart API chỉ dành cho Customer đã đăng nhập.
router.use(authenticate);
router.use(authorize("CUSTOMER"));

// GET /api/cart
router.get("/", controller.getCart);

// POST /api/cart/items
router.post(
    "/items",
    validateAddItem,
    controller.addItem
);

// PATCH /api/cart/items/:itemId
router.patch(
    "/items/:itemId",
    validateUuidParam("itemId"),
    validateUpdateItem,
    controller.updateItem
);

// DELETE /api/cart/items/:itemId
router.delete(
    "/items/:itemId",
    validateUuidParam("itemId"),
    controller.removeItem
);

// DELETE /api/cart/items
router.delete("/items", controller.clearCart);

module.exports = router;
