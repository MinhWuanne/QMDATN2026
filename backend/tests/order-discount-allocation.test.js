
const test = require("node:test");
const assert = require("node:assert/strict");
const { Prisma } = require("@prisma/client");

const {
    moneyToCents,
    allocateVoucherDiscount,
} = require("../modules/order/order-discount-allocation");

function makeItem(cartItemId, lineTotal, extra = {}) {
    return {
        cartItemId,
        productId: `product-${cartItemId}`,
        variantId: `variant-${cartItemId}`,
        quantity: 1,
        lineTotal: new Prisma.Decimal(lineTotal),
        ...extra,
    };
}

function asAmounts(items) {
    return Object.fromEntries(
        items.map((item) => [
            item.cartItemId,
            item.discountAmount.toFixed(2),
        ])
    );
}

function assertAllocationError(callback, message, statusCode) {
    assert.throws(callback, (error) => {
        assert.equal(error.message, message);
        assert.equal(error.statusCode, statusCode);
        return true;
    });
}

test("moneyToCents converts Decimal amounts to integer cents", () => {
    assert.equal(
        moneyToCents(new Prisma.Decimal("1.01")),
        101n
    );

    assert.equal(
        moneyToCents(new Prisma.Decimal("0.10")),
        10n
    );
});

test("allocates voucher discount proportionally across line totals", () => {
    const items = [
        makeItem("cart-a", "10.00"),
        makeItem("cart-b", "20.00"),
        makeItem("cart-c", "70.00"),
    ];

    const result = allocateVoucherDiscount(
        items,
        "10.00",
        "100.00"
    );

    assert.deepEqual(asAmounts(result), {
        "cart-a": "1.00",
        "cart-b": "2.00",
        "cart-c": "7.00",
    });

    const totalDiscount = result.reduce(
        (sum, item) => sum.add(item.discountAmount),
        new Prisma.Decimal(0)
    );

    assert.equal(totalDiscount.toFixed(2), "10.00");
});

test("uses cartItemId as deterministic tie-break for leftover cents", () => {
    const items = [
        makeItem("cart-c", "1.00"),
        makeItem("cart-a", "1.00"),
        makeItem("cart-b", "1.00"),
    ];

    const result = allocateVoucherDiscount(
        items,
        "0.01",
        "3.00"
    );

    assert.deepEqual(asAmounts(result), {
        "cart-a": "0.01",
        "cart-b": "0.00",
        "cart-c": "0.00",
    });
});

test("allocation is independent of input order", () => {
    const items = [
        makeItem("cart-c", "1.00"),
        makeItem("cart-a", "1.00"),
        makeItem("cart-b", "1.00"),
    ];

    const forward = allocateVoucherDiscount(
        items,
        "0.02",
        "3.00"
    );

    const reversed = allocateVoucherDiscount(
        [...items].reverse(),
        "0.02",
        "3.00"
    );

    assert.deepEqual(
        asAmounts(forward),
        asAmounts(reversed)
    );
});

test("zero discount allocates zero to every item", () => {
    const result = allocateVoucherDiscount(
        [
            makeItem("cart-a", "10.00"),
            makeItem("cart-b", "5.00"),
        ],
        "0.00",
        "15.00"
    );

    assert.deepEqual(asAmounts(result), {
        "cart-a": "0.00",
        "cart-b": "0.00",
    });
});

test("zero subtotal with zero discount is valid", () => {
    const result = allocateVoucherDiscount(
        [makeItem("cart-a", "0.00")],
        "0.00",
        "0.00"
    );

    assert.equal(
        result[0].discountAmount.toFixed(2),
        "0.00"
    );
});

test("rejects discount greater than subtotal", () => {
    assertAllocationError(
        () => allocateVoucherDiscount(
            [makeItem("cart-a", "10.00")],
            "10.01",
            "10.00"
        ),
        "INVALID_VOUCHER_DISCOUNT_ALLOCATION",
        400
    );
});

test("rejects mismatch between item totals and order subtotal", () => {
    assertAllocationError(
        () => allocateVoucherDiscount(
            [makeItem("cart-a", "9.99")],
            "1.00",
            "10.00"
        ),
        "ORDER_SUBTOTAL_MISMATCH",
        409
    );
});

test("rejects duplicate cartItemId values", () => {
    assertAllocationError(
        () => allocateVoucherDiscount(
            [
                makeItem("cart-a", "5.00"),
                makeItem("cart-a", "5.00"),
            ],
            "1.00",
            "10.00"
        ),
        "INVALID_ORDER_ITEM_REFERENCE",
        400
    );
});

test("preserves original item fields and excludes internal allocation fields", () => {
    const input = makeItem(
        "cart-a",
        "12.34",
        { sku: "SKU-001" }
    );

    const [result] = allocateVoucherDiscount(
        [input],
        "1.23",
        "12.34"
    );

    assert.equal(result.sku, "SKU-001");
    assert.equal(result.cartItemId, "cart-a");
    assert.equal(result.discountAmount.toFixed(2), "1.23");

    assert.equal("allocatedCents" in result, false);
    assert.equal("remainder" in result, false);
    assert.equal("lineCents" in result, false);
});
