const service = require("./voucher.service");

// ==========================================
// LIST
// ==========================================

async function listVouchers(req, res) {
    const result = await service.listVouchers(
        res.locals.validatedQuery || req.query
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

// ==========================================
// DETAIL
// ==========================================

async function getVoucher(req, res) {
    const voucher = await service.getVoucherById(req.params.id);

    return res.status(200).json({
        success: true,
        data: voucher,
    });
}

// ==========================================
// CREATE
// ==========================================

async function createVoucher(req, res) {
    const voucher = await service.createVoucher(req.body);

    return res.status(201).json({
        success: true,
        message: "VOUCHER_CREATED",
        data: voucher,
    });
}

// ==========================================
// UPDATE
// ==========================================

async function updateVoucher(req, res) {
    const voucher = await service.updateVoucher(
        req.params.id,
        req.body
    );

    return res.status(200).json({
        success: true,
        message: "VOUCHER_UPDATED",
        data: voucher,
    });
}

// ==========================================
// UPDATE STATUS
// ==========================================

async function updateVoucherStatus(req, res) {
    const voucher = await service.updateVoucherStatus(
        req.params.id,
        req.body.isActive
    );

    return res.status(200).json({
        success: true,
        message: "VOUCHER_STATUS_UPDATED",
        data: voucher,
    });
}

module.exports = {
    listVouchers,
    getVoucher,
    createVoucher,
    updateVoucher,
    updateVoucherStatus,
};