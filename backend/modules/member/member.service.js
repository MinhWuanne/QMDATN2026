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
            orderBy: [
                {
                    [sortBy]: sortOrder,
                },
                {
                    id: "asc",
                },
            ],
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
                orderBy: [
                    {
                        createdAt: "desc",
                    },
                    {
                        id: "asc",
                    },
                ],
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
// CUSTOMER MEMBERSHIP TIER
// ==========================================

const MEMBERSHIP_TIERS = [
    {
        key: "BRONZE",
        name: "Đồng",
        minSpend: 0,
        image: "/src/assets/hang-thanh-vien-dong.webp",
    },
    {
        key: "SILVER",
        name: "Bạc",
        minSpend: 10000000,
        image: "/src/assets/hang-thanh-vien-bac.webp",
    },
    {
        key: "GOLD",
        name: "Vàng",
        minSpend: 30000000,
        image: "/src/assets/hang-thanh-vien-vang.webp",
    },
    {
        key: "DIAMOND",
        name: "Kim cương",
        minSpend: 100000000,
        image: "/src/assets/hang-thanh-vien-kim-cuong.webp",
    },
];

async function getMyMembership(userId) {
    const customer = await prisma.user.findFirst({
        where: {
            id: userId,
            role: "CUSTOMER",
        },
        select: {
            id: true,
        },
    });

    if (!customer) {
        throw new Error("MEMBER_NOT_FOUND");
    }

    const orders = await prisma.order.findMany({
        where: {
            userId,
            status: "COMPLETED",
            paymentMethod: {
                not: "INTERNAL_EXCHANGE",
            },
            payment: {
                is: {
                    status: "PAID",
                },
            },
        },
        select: {
            id: true,
            totalAmount: true,
            payment: {
                select: {
                    transactions: {
                        where: {
                            type: "REFUND",
                            isSuccessful: true,
                        },
                        select: {
                            requestData: true,
                        },
                    },
                },
            },
        },
    });

    let totalSpend = new Prisma.Decimal(0);

    for (const order of orders) {
        let orderRefund = new Prisma.Decimal(0);

        for (const transaction of order.payment?.transactions ?? []) {
            const amount = transaction.requestData?.amount;

            if (amount === undefined || amount === null) {
                continue;
            }

            try {
                const refundAmount = new Prisma.Decimal(String(amount));

                if (refundAmount.isFinite() && refundAmount.gt(0)) {
                    orderRefund = orderRefund.plus(refundAmount);
                }
            } catch {
                // Bỏ qua dữ liệu amount không hợp lệ.
            }
        }

        const orderSpend = new Prisma.Decimal(order.totalAmount)
            .minus(orderRefund);

        // Không để một đơn có số tiền hoàn vượt giá trị đơn
        // làm giảm tổng chi tiêu của khách xuống mức âm.
        totalSpend = totalSpend.plus(
            Prisma.Decimal.max(orderSpend, 0)
        );
    }

    const currentTierIndex = MEMBERSHIP_TIERS.reduce(
        (currentIndex, tier, index) => {
            return totalSpend.gte(tier.minSpend)
                ? index
                : currentIndex;
        },
        0
    );

    const currentTier = MEMBERSHIP_TIERS[currentTierIndex];
    const nextTier = MEMBERSHIP_TIERS[currentTierIndex + 1] ?? null;

    const currentThreshold = new Prisma.Decimal(currentTier.minSpend);
    const nextThreshold = nextTier
        ? new Prisma.Decimal(nextTier.minSpend)
        : null;

    const remainingAmount = nextThreshold
        ? Prisma.Decimal.max(nextThreshold.minus(totalSpend), 0)
        : new Prisma.Decimal(0);

    const progress = nextTier
        ? Math.min(
            100,
            Math.max(
                0,
                Number(
                    totalSpend
                        .minus(currentThreshold)
                        .div(nextThreshold.minus(currentThreshold))
                        .mul(100)
                        .toFixed(2)
                )
            )
        )
        : 100;

    return {
        totalSpend: totalSpend.toFixed(2),
        purchaseCount: orders.length,

        currentTier: {
            key: currentTier.key,
            name: currentTier.name,
            minSpend: String(currentTier.minSpend),
            image: currentTier.image,
        },

        nextTier: nextTier
            ? {
                key: nextTier.key,
                name: nextTier.name,
                minSpend: String(nextTier.minSpend),
            }
            : null,

        remainingAmount: remainingAmount.toFixed(2),
        progress,

        isMaxTier: !nextTier,

        benefits: [
            {
                title: "Ưu đãi dành riêng cho thành viên",
                description: "Các chương trình ưu đãi theo hạng thành viên.",
                status: "COMING_SOON",
            },
            {
                title: "Ưu đãi sinh nhật",
                description: "Quà tặng và ưu đãi trong dịp sinh nhật.",
                status: "COMING_SOON",
            },
            {
                title: "Chương trình chăm sóc thành viên",
                description: "Các quyền lợi chăm sóc khách hàng theo hạng.",
                status: "COMING_SOON",
            },
        ],
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
    getMyMembership,
};
