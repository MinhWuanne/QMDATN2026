const express = require("express");

const {
    authenticate,
    authorize,
} = require("../middlewares/auth.middleware");

const validate = require("../middlewares/validate.middleware");

const chatController = require("../modules/chat/chat.controller");
const memberController = require("../modules/member/member.controller");
const {
    chatMessageBodySchema,
    chatMessageListQuerySchema,
} = require("../modules/chat/chat.validator");

const addressController = require("../modules/address/address.controller");

const {
    addressIdParamsSchema,
    createAddressSchema,
    updateAddressSchema,
} = require("../modules/address/address.validator");

const router = express.Router();

// All Member routes require an authenticated Customer.
router.use(authenticate, authorize("CUSTOMER"));

router.use(
  "/vouchers",
  require("../modules/voucher/voucher.validation.routes")
);

// ==========================================
// CHAT
// ==========================================

// GET /api/member/chat/messages
router.get(
    "/chat/messages",
    validate(chatMessageListQuerySchema, "query"),
    chatController.getMemberMessages
);

// POST /api/member/chat/messages
router.post(
    "/chat/messages",
    validate(chatMessageBodySchema),
    chatController.sendMemberMessage
);

// ==========================================
// ADDRESS BOOK
// ==========================================

// GET /api/member/addresses
router.get(
    "/addresses",
    addressController.getMyAddresses
);

// POST /api/member/addresses
router.post(
    "/addresses",
    validate(createAddressSchema),
    addressController.createMyAddress
);

// PATCH /api/member/addresses/:addressId/default
router.patch(
    "/addresses/:addressId/default",
    validate(addressIdParamsSchema, "params"),
    addressController.setMyDefaultAddress
);

// PATCH /api/member/addresses/:addressId
router.patch(
    "/addresses/:addressId",
    validate(addressIdParamsSchema, "params"),
    validate(updateAddressSchema),
    addressController.updateMyAddress
);

// DELETE /api/member/addresses/:addressId
router.delete(
    "/addresses/:addressId",
    validate(addressIdParamsSchema, "params"),
    addressController.deleteMyAddress
);

router.get("/membership", memberController.getMyMembership);

module.exports = router;
