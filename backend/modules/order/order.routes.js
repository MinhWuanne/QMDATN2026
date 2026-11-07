
const express = require("express");

const router = express.Router();

const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");

const orderController = require("./order.controller");
const orderValidator = require("./order.validator");

// ==========================================
// CUSTOMER ROUTES
// ==========================================

router.use(authenticate);

// Tạo đơn hàng từ giỏ hàng
router.post(
    "/",
    authorize("CUSTOMER"),
    validate(orderValidator.createOrderSchema),
    orderController.createOrder
);

// Danh sách đơn hàng của khách
router.get(
    "/",
    authorize("CUSTOMER"),
    validate(orderValidator.myOrderListQuerySchema, "query"),
    orderController.listMyOrders
);

// Chi tiết đơn hàng của khách
router.get(
    "/:orderId",
    authorize("CUSTOMER"),
    validate(orderValidator.orderIdParamsSchema, "params"),
    orderController.getMyOrderById
);

// Khách hủy đơn
router.post(
    "/:orderId/cancel",
    authorize("CUSTOMER"),
    validate(orderValidator.orderIdParamsSchema, "params"),
    validate(orderValidator.cancelOrderSchema),
    orderController.cancelMyOrder
);

// ==========================================
// ADMIN ROUTES
// ==========================================

const adminRouter = express.Router();

adminRouter.use(authenticate, authorize("ADMIN"));

// Danh sách tất cả đơn hàng
adminRouter.get(
    "/",
    validate(orderValidator.adminOrderListQuerySchema, "query"),
    orderController.listAdminOrders
);

// Chi tiết đơn hàng
adminRouter.get(
    "/:orderId",
    validate(orderValidator.orderIdParamsSchema, "params"),
    orderController.getAdminOrderById
);

// Cập nhật trạng thái đơn
adminRouter.patch(
    "/:orderId/status",
    validate(orderValidator.orderIdParamsSchema, "params"),
    validate(orderValidator.updateOrderStatusSchema),
    orderController.updateOrderStatus
);

// Admin xác nhận đã nhận tiền COD
adminRouter.post(
    "/:orderId/mark-paid",
    validate(orderValidator.orderIdParamsSchema, "params"),
    validate(orderValidator.markOrderPaidSchema),
    orderController.markOrderPaid
);

// Admin hủy đơn
adminRouter.post(
    "/:orderId/cancel",
    validate(orderValidator.orderIdParamsSchema, "params"),
    validate(orderValidator.cancelOrderSchema),
    orderController.cancelAdminOrder
);

// Export riêng để tích hợp vào app ở bước sau
module.exports = {
    customerOrderRouter: router,
    adminOrderRouter: adminRouter,
};
