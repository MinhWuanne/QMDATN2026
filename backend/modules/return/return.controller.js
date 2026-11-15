const returnService = require("./return.service");

function respond(res, statusCode, message, data) {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
}

async function createMyReturnRequest(req, res, next) {
    try {
        const data = await returnService.createReturnRequest(
            req.user.id,
            req.body
        );
        return respond(res, 201, "RETURN_REQUEST_CREATED", data);
    } catch (error) {
        next(error);
    }
}

async function listMyReturnRequests(req, res, next) {
    try {
        const data = await returnService.listMyReturnRequests(
            req.user.id,
            res.locals.validatedQuery
        );
        return respond(res, 200, "RETURN_REQUESTS_RETRIEVED", data);
    } catch (error) {
        next(error);
    }
}

async function getMyReturnRequest(req, res, next) {
    try {
        const data = await returnService.getMyReturnRequest(
            req.user.id,
            req.params.returnRequestId
        );
        return respond(res, 200, "RETURN_REQUEST_RETRIEVED", data);
    } catch (error) {
        next(error);
    }
}

async function listAdminReturnRequests(req, res, next) {
    try {
        const data = await returnService.listAdminReturnRequests(
            res.locals.validatedQuery
        );
        return respond(res, 200, "RETURN_REQUESTS_RETRIEVED", data);
    } catch (error) {
        next(error);
    }
}

async function getAdminReturnRequest(req, res, next) {
    try {
        const data = await returnService.getAdminReturnRequest(
            req.params.returnRequestId
        );
        return respond(res, 200, "RETURN_REQUEST_RETRIEVED", data);
    } catch (error) {
        next(error);
    }
}

async function approveReturnRequest(req, res, next) {
    try {
        const data = await returnService.approveReturnRequest(
            req.params.returnRequestId,
            req.user.id,
            req.body.adminNote
        );
        return respond(res, 200, "RETURN_REQUEST_APPROVED", data);
    } catch (error) {
        next(error);
    }
}

async function rejectReturnRequest(req, res, next) {
    try {
        const data = await returnService.rejectReturnRequest(
            req.params.returnRequestId,
            req.user.id,
            req.body.rejectionReason
        );
        return respond(res, 200, "RETURN_REQUEST_REJECTED", data);
    } catch (error) {
        next(error);
    }
}

async function receiveReturnedItem(req, res, next) {
    try {
        const data = await returnService.receiveReturnedItem(
            req.params.returnRequestId,
            req.user.id,
            req.body.conditionNote
        );
        return respond(res, 200, "RETURN_ITEM_RECEIVED", data);
    } catch (error) {
        next(error);
    }
}

async function retryExchangeWhenStockAvailable(req, res, next) {
    try {
        const data = await returnService.retryExchangeWhenStockAvailable(
            req.params.returnRequestId,
            req.user.id
        );
        return respond(res, 200, "EXCHANGE_REPLACEMENT_CREATED", data);
    } catch (error) {
        next(error);
    }
}

async function confirmManualRefund(req, res, next) {
    try {
        const data = await returnService.confirmManualRefund(
            req.params.returnRequestId,
            req.user.id,
            req.body
        );
        return respond(res, 200, "RETURN_REFUND_CONFIRMED", data);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createMyReturnRequest,
    listMyReturnRequests,
    getMyReturnRequest,
    listAdminReturnRequests,
    getAdminReturnRequest,
    approveReturnRequest,
    rejectReturnRequest,
    receiveReturnedItem,
    retryExchangeWhenStockAvailable,
    confirmManualRefund,
};