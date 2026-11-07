
const inventoryService = require("./inventory.service");

// ==========================================
// GET /inventory
// ==========================================

async function listInventory(req, res) {
    const result = await inventoryService.listInventory(
        res.locals.validatedQuery
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

// ==========================================
// GET /inventory/:variantId
// ==========================================

async function getInventoryByVariantId(req, res) {
    const result = await inventoryService.getInventoryByVariantId(
        req.params.variantId
    );

    return res.status(200).json({
        success: true,
        data: result,
    });
}

// ==========================================
// GET /inventory/:variantId/movements
// ==========================================

async function listInventoryMovements(req, res) {
    const result = await inventoryService.listInventoryMovements(
        req.params.variantId,
        res.locals.validatedQuery
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

// ==========================================
// POST /inventory/purchase
// ==========================================

async function purchaseInventory(req, res) {
    const result = await inventoryService.purchaseInventory(
        req.body,
        req.user.id
    );

    return res.status(201).json({
        success: true,
        message: "INVENTORY_PURCHASE_CREATED",
        data: result,
    });
}

// ==========================================
// POST /inventory/adjustment
// ==========================================

async function adjustInventory(req, res) {
    const result = await inventoryService.adjustInventory(
        req.body,
        req.user.id
    );

    return res.status(200).json({
        success: true,
        message: "INVENTORY_ADJUSTMENT_CREATED",
        data: result,
    });
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    listInventory,
    getInventoryByVariantId,
    listInventoryMovements,
    purchaseInventory,
    adjustInventory,
};
