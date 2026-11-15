
const { Prisma } = require("@prisma/client");

function throwAllocationError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

// Convert a monetary Decimal to an exact integer number of cents.
function moneyToCents(value) {
    const cents = new Prisma.Decimal(value).mul(100).toDecimalPlaces(
        0,
        Prisma.Decimal.ROUND_HALF_UP
    );

    return BigInt(cents.toFixed(0));
}

// Allocate an order-level voucher discount using the Largest Remainder Method.
// Equal remainders are resolved by cartItemId to ensure deterministic results.
function allocateVoucherDiscount(items, discountAmount, subtotal) {
    if (!Array.isArray(items) || items.length === 0) {
        throwAllocationError("INVALID_ORDER_ITEMS");
    }

    const seenCartItemIds = new Set();

    const normalizedItems = items.map((item) => {
        if (
            !item ||
            typeof item.cartItemId !== "string" ||
            item.cartItemId.trim() === "" ||
            seenCartItemIds.has(item.cartItemId)
        ) {
            throwAllocationError("INVALID_ORDER_ITEM_REFERENCE");
        }

        seenCartItemIds.add(item.cartItemId);

        const lineCents = moneyToCents(item.lineTotal);

        if (lineCents < 0n) {
            throwAllocationError("INVALID_ORDER_ITEM_TOTAL");
        }

        return {
            ...item,
            lineCents,
        };
    });

    const discountCents = moneyToCents(discountAmount);
    const subtotalCents = moneyToCents(subtotal);

    if (
        discountCents < 0n ||
        subtotalCents < 0n ||
        discountCents > subtotalCents
    ) {
        throwAllocationError("INVALID_VOUCHER_DISCOUNT_ALLOCATION");
    }

    const itemTotalCents = normalizedItems.reduce(
        (total, item) => total + item.lineCents,
        0n
    );

    if (itemTotalCents !== subtotalCents) {
        throwAllocationError("ORDER_SUBTOTAL_MISMATCH", 409);
    }

    // A zero-value order cannot receive a non-zero discount.
    if (subtotalCents === 0n) {
        if (discountCents !== 0n) {
            throwAllocationError("INVALID_VOUCHER_DISCOUNT_ALLOCATION");
        }

        return normalizedItems.map(({ lineCents, ...item }) => ({
            ...item,
            discountAmount: new Prisma.Decimal(0),
        }));
    }

    // Calculate each item's initial allocation and remainder.
    const allocations = normalizedItems.map((item) => {
        const numerator = discountCents * item.lineCents;

        return {
            ...item,
            allocatedCents: numerator / subtotalCents,
            remainder: numerator % subtotalCents,
        };
    });

    const initiallyAllocated = allocations.reduce(
        (total, item) => total + item.allocatedCents,
        0n
    );

    let remainingCents = discountCents - initiallyAllocated;

    // Largest remainders receive the remaining cents.
    // cartItemId is the deterministic tie-break.
    const remainderRanking = [...allocations].sort((a, b) => {
        if (a.remainder > b.remainder) return -1;
        if (a.remainder < b.remainder) return 1;

        return a.cartItemId.localeCompare(b.cartItemId);
    });

    for (let index = 0; remainingCents > 0n; index++) {
        if (index >= remainderRanking.length) {
            throwAllocationError(
                "VOUCHER_DISCOUNT_ALLOCATION_FAILED",
                500
            );
        }

        remainderRanking[index].allocatedCents += 1n;
        remainingCents -= 1n;
    }

    // Return original item fields plus the allocated discount.
    // Internal calculation fields are intentionally excluded.
    return allocations.map(
        ({ lineCents, allocatedCents, remainder, ...item }) => ({
            ...item,
            discountAmount: new Prisma.Decimal(
                allocatedCents.toString()
            )
                .div(100)
                .toDecimalPlaces(2),
        })
    );
}

module.exports = {
    moneyToCents,
    allocateVoucherDiscount,
};
