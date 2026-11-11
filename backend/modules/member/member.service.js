const prisma = require("../../core/database/prisma");
const { Prisma } = require("@prisma/client");

// ==========================================
// CONSTANTS
// ==========================================

const SUCCESSFUL_ORDER_WHERE = {
    status: "COMPLETED",

    payment: {
        is: {
            status: "PAID",
        },
    },

    user: {
        is: {
            role: "CUSTOMER",
        },
    },
};

// ==========================================
// ERROR HANDLING
// ==========================================

function handleMemberError(error) {
    if (error.code === "P2034") {
        throw new Error("MEMBER_CONCURRENT_UPDATE");
    }

    throw error;
}

// ==========================================
// FILTERS
// ==========================================

function buildMemberWhere(filters = {}) {
    return {
        role: "CUSTOMER",

        ...(filters.status
            ? { status: filters.status }
            : {}),

        ...(filters.search
            ? {
                OR: [
                    {
                        fullName: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        email: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                    {
                        phone: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {}),
    };
}

// ==========================================
// LIST MEMBERS
// ==========================================

async function listMembers(query = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const allowedSortFields = [
        "createdAt",
        "fullName",
        "email",
        "status",
    ];

    const sortBy = allowedSortFields.includes(query.sortBy)
        ? query.sortBy
        : "createdAt";

    const sortOrder = query.sortOrder === "asc"
        ? "asc"
        : "desc";

    const where = buildMemberWhere(query);

    const [members, total] = await prisma.$transaction([
        prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                [sortBy]: sortOrder,
            },
            select: {
                id: true,
                email: true,
                phone: true,
                fullName: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        }),

        prisma.user.count({ where }),
    ]);

    // Avoid an unnecessary aggregate query on an empty page.
    const memberIds = members.map((member) => member.id);

    const orderStats = memberIds.length > 0
        ? await prisma.order.groupBy({
            by: ["userId"],
            where: {
                ...SUCCESSFUL_ORDER_WHERE,
                userId: {
                    in: memberIds,
                },
            },
            _count: {
                _all: true,
            },
            _sum: {
                totalAmount: true,
            },
        })
        : [];

    const statsByUserId = new Map(
        orderStats.map((item) => [
            item.userId,
            {
                purchaseCount: item._count._all,
                totalSpend: item._sum.totalAmount?.toFixed(2) ?? "0.00",
            },
        ])
    );

    const items = members.map((member) => {
        const stats = statsByUserId.get(member.id);

        return {
            ...member,
            purchaseCount: stats?.purchaseCount ?? 0,
            totalSpend: stats?.totalSpend ?? "0.00",
        };
    });

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

// ==========================================
// MEMBER OVERVIEW STATS
// ==========================================

async function getMemberStats() {
    const [
        totalCustomers,
        statusGroups,
        orderAggregate,
        customerOrderGroups,
    ] = await Promise.all([
        prisma.user.count({
            where: {
                role: "CUSTOMER",
            },
        }),

        prisma.user.groupBy({
            by: ["status"],
            where: {
                role: "CUSTOMER",
            },
            _count: {
                _all: true,
            },
        }),

        prisma.order.aggregate({
            where: SUCCESSFUL_ORDER_WHERE,
            _count: {
                _all: true,
            },
            _sum: {
                totalAmount: true,
            },
        }),

        prisma.order.groupBy({
            by: ["userId"],
            where: SUCCESSFUL_ORDER_WHERE,
            _count: {
                _all: true,
            },
        }),
    ]);

    const statusCounts = {
        ACTIVE: 0,
        LOCKED: 0,
        PENDING_VERIFICATION: 0,
    };

    for (const group of statusGroups) {
        statusCounts[group.status] = group._count._all;
    }

    const customersWithPurchases = customerOrderGroups.length;

    const repeatCustomers = customerOrderGroups.filter(
        (group) => group._count._all >= 2
    ).length;

    const repeatPurchaseRate = customersWithPurchases > 0
        ? Number(
            ((repeatCustomers / customersWithPurchases) * 100).toFixed(2)
        )
        : 0;

    return {
        totalCustomers,

        statusCounts,

        customersWithPurchases,
        repeatCustomers,
        repeatPurchaseRate,

        completedOrderCount: orderAggregate._count._all,

        totalSpend: orderAggregate._sum.totalAmount?.toFixed(2) ?? "0.00",
    };
}

// ==========================================
// MEMBER DETAIL
// ==========================================

async function getMemberById(id) {
    const member = await prisma.user.findFirst({
        where: {
            id,
            role: "CUSTOMER",
        },

        select: {
            id: true,
            email: true,
            phone: true,
            fullName: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,

            // Latest 10 orders, including unsuccessful orders.
            orders: {
                take: 10,
                orderBy: {
                    createdAt: "desc",
                },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    paymentMethod: true,
                    subtotal: true,
                    discountAmount: true,
                    shippingFee: true,
                    totalAmount: true,
                    completedAt: true,
                    createdAt: true,

                    payment: {
                        select: {
                            status: true,
                            paidAt: true,
                        },
                    },

                    items: {
                        select: {
                            id: true,
                            productName: true,
                            variantName: true,
                            sku: true,
                            unitPrice: true,
                            quantity: true,
                            lineTotal: true,
                        },
                    },
                },
            },

            // Latest 10 account status changes.
            statusHistories: {
                take: 10,
                orderBy: {
                    createdAt: "desc",
                },
                select: {
                    id: true,
                    oldStatus: true,
                    newStatus: true,
                    reason: true,
                    createdAt: true,

                    admin: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });

    if (!member) {
        throw new Error("MEMBER_NOT_FOUND");
    }

    const [
        orderAggregate,
        itemAggregate,
    ] = await Promise.all([
        prisma.order.aggregate({
            where: {
                ...SUCCESSFUL_ORDER_WHERE,
                userId: id,
            },
            _count: {
                _all: true,
            },
            _sum: {
                totalAmount: true,
            },
        }),

        prisma.orderItem.aggregate({
            where: {
                order: {
                    is: {
                        ...SUCCESSFUL_ORDER_WHERE,
                        userId: id,
                    },
                },
            },
            _sum: {
                quantity: true,
            },
        }),
    ]);

    return {
        ...member,

        purchaseStats: {
            purchaseCount: orderAggregate._count._all,

            totalSpend:
                orderAggregate._sum.totalAmount?.toFixed(2) ?? "0.00",

            totalItemsPurchased:
                itemAggregate._sum.quantity ?? 0,
        },
    };
}

// ==========================================
// UPDATE MEMBER STATUS
// ==========================================

async function updateMemberStatus(id, input, adminId) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const member = await tx.user.findFirst({
                    where: {
                        id,
                        role: "CUSTOMER",
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

                if (!member) {
                    throw new Error("MEMBER_NOT_FOUND");
                }

                if (
                    member.status !== "ACTIVE" &&
                    member.status !== "LOCKED"
                ) {
                    throw new Error("MEMBER_STATUS_INVALID");
                }

                if (member.status === input.status) {
                    throw new Error("MEMBER_STATUS_UNCHANGED");
                }

                const updated = await tx.user.updateMany({
                    where: {
                        id,
                        role: "CUSTOMER",
                        status: member.status,
                    },
                    data: {
                        status: input.status,
                    },
                });

                if (updated.count !== 1) {
                    throw new Error("MEMBER_CONCURRENT_UPDATE");
                }

                await tx.userStatusHistory.create({
                    data: {
                        userId: id,
                        changedBy: adminId,
                        oldStatus: member.status,
                        newStatus: input.status,
                        reason: input.reason,
                    },
                });

                return tx.user.findUnique({
                    where: {
                        id,
                    },
                    select: {
                        id: true,
                        email: true,
                        phone: true,
                        fullName: true,
                        role: true,
                        status: true,
                        updatedAt: true,
                    },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleMemberError(error);
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    listMembers,
    getMemberStats,
    getMemberById,
    updateMemberStatus,
};
