const service = require("./customer-catalog.service");

async function listProducts(req, res, next) {
    try {
        const result = await service.listProducts(
            res.locals.customerCatalogQuery || {}
        );

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
}

async function getProduct(req, res, next) {
    try {
        const product = await service.getProductByIdentifier(
            req.params.identifier
        );

        return res.status(200).json({
            success: true,
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

async function listCategories(req, res, next) {
    try {
        const categories = await service.listCategories();

        return res.status(200).json({
            success: true,
            data: categories,
        });
    } catch (error) {
        next(error);
    }
}

async function listBrands(req, res, next) {
    try {
        const brands = await service.listBrands();

        return res.status(200).json({
            success: true,
            data: brands,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listProducts,
    getProduct,
    listCategories,
    listBrands,
};