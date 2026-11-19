const addressService = require("./address.service");

async function getMyAddresses(req, res, next) {
    try {
        const addresses = await addressService.listMyAddresses(req.user.id);

        return res.status(200).json({
            success: true,
            data: addresses,
        });
    } catch (error) {
        next(error);
    }
}

async function createMyAddress(req, res, next) {
    try {
        const address = await addressService.createMyAddress(
            req.user.id,
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "ADDRESS_CREATED",
            data: address,
        });
    } catch (error) {
        next(error);
    }
}

async function updateMyAddress(req, res, next) {
    try {
        const address = await addressService.updateMyAddress(
            req.user.id,
            req.params.addressId,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "ADDRESS_UPDATED",
            data: address,
        });
    } catch (error) {
        next(error);
    }
}

async function setMyDefaultAddress(req, res, next) {
    try {
        const address = await addressService.setMyDefaultAddress(
            req.user.id,
            req.params.addressId
        );

        return res.status(200).json({
            success: true,
            message: "ADDRESS_DEFAULT_UPDATED",
            data: address,
        });
    } catch (error) {
        next(error);
    }
}

async function deleteMyAddress(req, res, next) {
    try {
        const result = await addressService.deleteMyAddress(
            req.user.id,
            req.params.addressId
        );

        return res.status(200).json({
            success: true,
            message: "ADDRESS_DELETED",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getMyAddresses,
    createMyAddress,
    updateMyAddress,
    setMyDefaultAddress,
    deleteMyAddress,
};
