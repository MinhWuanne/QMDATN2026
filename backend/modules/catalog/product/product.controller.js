const service = require("./product.service");

async function listProducts(req, res) {
    const result = await service.listProducts(
        res.locals.validatedQuery || req.query
    );

    return res.status(200).json({
        success: true,
        ...result,
    });
}

async function getProduct(req, res) {
    const product = await service.getProductById(req.params.id);

    return res.status(200).json({
        success: true,
        data: product,
    });
}

async function createProduct(req, res) {
    const product = await service.createProduct(req.body);

    return res.status(201).json({
        success: true,
        message: "PRODUCT_CREATED",
        data: product,
    });
}

async function updateProduct(req, res) {
    const product = await service.updateProduct(
        req.params.id,
        req.body
    );

    return res.status(200).json({
        success: true,
        message: "PRODUCT_UPDATED",
        data: product,
    });
}

async function updateProductStatus(req, res) {
    const product = await service.updateProductStatus(
        req.params.id,
        req.body.status
    );

    return res.status(200).json({
        success: true,
        message: "PRODUCT_STATUS_UPDATED",
        data: product,
    });
}

async function archiveProduct(req, res) {
    const product = await service.archiveProduct(req.params.id);

    return res.status(200).json({
        success: true,
        message: "PRODUCT_ARCHIVED",
        data: product,
    });
}

async function addProductVariant(req, res) {
    const variant = await service.addProductVariant(
        req.params.id,
        req.body
    );

    return res.status(201).json({
        success: true,
        message: "PRODUCT_VARIANT_CREATED",
        data: variant,
    });
}

async function updateProductVariant(req, res) {
    const variant = await service.updateProductVariant(
        req.params.id,
        req.params.variantId,
        req.body
    );

    return res.status(200).json({
        success: true,
        message: "PRODUCT_VARIANT_UPDATED",
        data: variant,
    });
}

async function deactivateProductVariant(req, res) {
    const variant = await service.deactivateProductVariant(
        req.params.id,
        req.params.variantId
    );

    return res.status(200).json({
        success: true,
        message: "PRODUCT_VARIANT_DEACTIVATED",
        data: variant,
    });
}

module.exports = {
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    updateProductStatus,
    archiveProduct,
    addProductVariant,
    updateProductVariant,
    deactivateProductVariant,
};