const test = require("node:test");
const assert = require("node:assert/strict");
const { Prisma } = require("@prisma/client");

const {
    calculateRefundAmount,
} = require("../modules/return/return.service");

const {
    createReturnRequestSchema,
} = require("../modules/return/return.validator");

test("refund calculation uses requested quantity and proportional item discount", () => {
    const orderItem = {
        unitPrice: new Prisma.Decimal("100000.00"),
        quantity: 3,
        discountAmount: new Prisma.Decimal("10000.00"),
    };

    assert.equal(
        calculateRefundAmount(orderItem, 1).toFixed(2),
        "96666.67"
    );

    assert.equal(
        calculateRefundAmount(orderItem, 2).toFixed(2),
        "193333.33"
    );
});

test("refund calculation does not include shipping fee", () => {
    const orderItem = {
        unitPrice: new Prisma.Decimal("250000.00"),
        quantity: 1,
        discountAmount: new Prisma.Decimal("15000.00"),
    };

    assert.equal(
        calculateRefundAmount(orderItem, 1).toFixed(2),
        "235000.00"
    );
});

test("customer can submit a valid refund request", () => {
    const result = createReturnRequestSchema.safeParse({
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        orderItemId: "550e8400-e29b-41d4-a716-446655440001",
        quantity: 1,
        resolution: "REFUND",
        reason: "Sản phẩm bị lỗi",
    });

    assert.equal(result.success, true);
});

test("exchange request requires a target variant", () => {
    const result = createReturnRequestSchema.safeParse({
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        orderItemId: "550e8400-e29b-41d4-a716-446655440001",
        quantity: 1,
        resolution: "EXCHANGE",
        reason: "Muốn đổi phiên bản",
    });

    assert.equal(result.success, false);
});

test("refund request cannot contain an exchange variant", () => {
    const result = createReturnRequestSchema.safeParse({
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        orderItemId: "550e8400-e29b-41d4-a716-446655440001",
        quantity: 1,
        resolution: "REFUND",
        reason: "Sản phẩm bị lỗi",
        exchangeVariantId: "550e8400-e29b-41d4-a716-446655440002",
    });

    assert.equal(result.success, false);
});
