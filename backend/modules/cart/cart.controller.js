
const service = require("./cart.service");

async function getCart(req, res, next) {
    try {
        const cart = await service.getCart(req.user.id);

        return res.status(200).json({
            success: true,
            data: cart,
        });
    } catch (error) {
        next(error);
    }
}

async function addItem(req, res, next) {
    try {
        const cart = await service.addItem(
            req.user.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "CART_ITEM_ADDED",
            data: cart,
        });
    } catch (error) {
        next(error);
    }
}

async function updateItem(req, res, next) {
    try {
        const cart = await service.updateItem(
            req.user.id,
            req.params.itemId,
            req.body.quantity
        );

        return res.status(200).json({
            success: true,
            message: "CART_ITEM_UPDATED",
            data: cart,
        });
    } catch (error) {
        next(error);
    }
}

async function removeItem(req, res, next) {
    try {
        const cart = await service.removeItem(
            req.user.id,
            req.params.itemId
        );

        return res.status(200).json({
            success: true,
            message: "CART_ITEM_REMOVED",
            data: cart,
        });
    } catch (error) {
        next(error);
    }
}

async function clearCart(req, res, next) {
    try {
        const cart = await service.clearCart(req.user.id);

        return res.status(200).json({
            success: true,
            message: "CART_CLEARED",
            data: cart,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
};
