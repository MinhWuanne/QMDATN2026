let lastVnpayExpiryCheck = 0;
let vnpayExpiryCheckPromise = null;

const VNPAY_EXPIRY_CHECK_INTERVAL = 60 * 1000;

async function processExpiredVnpayOrders() {
    const now = Date.now();

    if (now - lastVnpayExpiryCheck < VNPAY_EXPIRY_CHECK_INTERVAL) {
        return;
    }

    if (vnpayExpiryCheckPromise) {
        return vnpayExpiryCheckPromise;
    }

    vnpayExpiryCheckPromise = (async () => {
        try {
            await orderService.expirePendingVnpayOrders();
            lastVnpayExpiryCheck = Date.now();
        } finally {
            vnpayExpiryCheckPromise = null;
        }
    })();

    return vnpayExpiryCheckPromise;
}

async function createOrder(req, res, next) {
    try {
        const order = await orderService.createOrder(
            req.user.id,
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "ORDER_CREATED",
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

async function startCheckout(req, res, next) {
    try {
        // Khởi tạo hoặc lấy lại phiên checkout 10 phút.
        const checkout = await orderService.startCheckout(
            req.params.orderId,
            req.user.id
        );

        // Tạo URL VNPAY hoặc sử dụng URL đã tạo trước đó.
        const payment = await paymentService.createOrGetVnpayPaymentUrl({
            orderId: req.params.orderId,
            userId: req.user.id,
            ipAddr: req.ip,
        });

        return res.status(200).json({
            success: true,
            message: "Checkout session started successfully",
            data: {
                ...checkout,
                paymentUrl: payment.paymentUrl,
                txnRef: payment.txnRef,
                reused: payment.reused,
            },
        });
    } catch (error) {
        next(error);
    }
}

async function listMyOrders(req, res, next) {
    try {
        await processExpiredVnpayOrders();

        const orders = await orderService.listMyOrders(
            req.user.id,
            res.locals.validatedQuery
        );

        return res.status(200).json({
            success: true,
            data: orders,
        });
    } catch (error) {
        next(error);
    }
}

async function getMyOrderById(req, res, next) {
    try {
        await processExpiredVnpayOrders();

        const order = await orderService.getMyOrderById(
            req.user.id,
            req.params.orderId
        );

        return res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

async function cancelMyOrder(req, res, next) {
    try {
        const order = await orderService.cancelMyOrder(
            req.user.id,
            req.params.orderId,
            req.body.note
        );

        return res.status(200).json({
            success: true,
            message: "ORDER_CANCELLED",
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

// ==========================================
// ADMIN
// Các hàm này sẽ được nối với service sau
// khi hoàn thiện nghiệp vụ Admin.
// ==========================================

async function listAdminOrders(req, res, next) {
    try {
        await processExpiredVnpayOrders();

        const orders = await orderService.listAdminOrders(
            res.locals.validatedQuery
        );

        return res.status(200).json({
            success: true,
            data: orders,
        });
    } catch (error) {
        next(error);
    }
}

async function getAdminOrderById(req, res, next) {
    try {
        const order = await orderService.getAdminOrderById(
            req.params.orderId
        );

        return res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

async function updateOrderStatus(req, res, next) {
    try {
        const order = await orderService.updateOrderStatus(
            req.params.orderId,
            req.body.status,
            req.user.id,
            req.body.note
        );

        return res.status(200).json({
            success: true,
            message: "ORDER_STATUS_UPDATED",
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

async function markOrderPaid(req, res, next) {
    try {
        const payment = await orderService.markOrderPaid(
            req.params.orderId,
            req.user.id,
            req.body.note
        );

        return res.status(200).json({
            success: true,
            message: "ORDER_PAYMENT_MARKED_PAID",
            data: payment,
        });
    } catch (error) {
        next(error);
    }
}

async function cancelAdminOrder(req, res, next) {
    try {
        const order = await orderService.cancelAdminOrder(
            req.params.orderId,
            req.user.id,
            req.body.note
        );

        return res.status(200).json({
            success: true,
            message: "ORDER_CANCELLED",
            data: order,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createOrder,
    listMyOrders,
    getMyOrderById,
    cancelMyOrder,

    listAdminOrders,
    getAdminOrderById,
    updateOrderStatus,
    markOrderPaid,
    cancelAdminOrder,
    startCheckout,
};
