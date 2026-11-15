const express = require("express");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");
const controller = require("./return.controller");
const validator = require("./return.validator");

const customerRouter = express.Router();
customerRouter.use(authenticate, authorize("CUSTOMER"));

customerRouter.post(
    "/",
    validate(validator.createReturnRequestSchema),
    controller.createMyReturnRequest
);
customerRouter.get(
    "/",
    validate(validator.myReturnListQuerySchema, "query"),
    controller.listMyReturnRequests
);
customerRouter.get(
    "/:returnRequestId",
    validate(validator.returnIdParamsSchema, "params"),
    controller.getMyReturnRequest
);

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize("ADMIN"));

adminRouter.get(
    "/",
    validate(validator.adminReturnListQuerySchema, "query"),
    controller.listAdminReturnRequests
);
adminRouter.get(
    "/:returnRequestId",
    validate(validator.returnIdParamsSchema, "params"),
    controller.getAdminReturnRequest
);
adminRouter.post(
    "/:returnRequestId/approve",
    validate(validator.returnIdParamsSchema, "params"),
    validate(validator.adminNoteSchema),
    controller.approveReturnRequest
);
adminRouter.post(
    "/:returnRequestId/reject",
    validate(validator.returnIdParamsSchema, "params"),
    validate(validator.rejectReturnSchema),
    controller.rejectReturnRequest
);
adminRouter.post(
    "/:returnRequestId/receive",
    validate(validator.returnIdParamsSchema, "params"),
    validate(validator.receiveReturnSchema),
    controller.receiveReturnedItem
);
adminRouter.post(
    "/:returnRequestId/retry-exchange",
    validate(validator.returnIdParamsSchema, "params"),
    validate(validator.adminNoteSchema),
    controller.retryExchangeWhenStockAvailable
);
adminRouter.post(
    "/:returnRequestId/confirm-refund",
    validate(validator.returnIdParamsSchema, "params"),
    validate(validator.manualRefundSchema),
    controller.confirmManualRefund
);

module.exports = {
    customerReturnRouter: customerRouter,
    adminReturnRouter: adminRouter,
};