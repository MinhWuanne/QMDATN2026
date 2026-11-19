
const prisma = require("../../core/database/prisma");
const { Prisma } = require("@prisma/client");

// ==========================================
// ERROR HANDLING
// ==========================================

function handleProfileRequestError(error) {
    if (error.code === "P2034") {
        throw new Error("MEMBER_PROFILE_REQUEST_CONCURRENT_UPDATE");
    }

    if (error.code === "P2002") {
        const target = error.meta?.target;

        const targetText = Array.isArray(target)
            ? target.join(" ").toLowerCase()
            : String(target || "").toLowerCase();

        if (
            targetText.includes("member_profile_requests_one_requested_per_user_key") ||
            targetText.includes("user_id") ||
            targetText.includes("userid")
        ) {
            throw new Error("MEMBER_PROFILE_REQUEST_ALREADY_PENDING");
        }

        if (
            targetText.includes("users_phone_key") ||
            targetText.includes("phone")
        ) {
            throw new Error("PHONE_ALREADY_EXISTS");
        }
    }

    throw error;
}

// ==========================================
// CONSTANTS
// ==========================================

const PROFILE_REQUEST_SELECT = {
    id: true,
    userId: true,
    requestedFullName: true,
    requestedPhone: true,
    status: true,
    adminNote: true,
    processedById: true,
    processedAt: true,
    createdAt: true,
    updatedAt: true,

    user: {
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
        },
    },

    processedBy: {
        select: {
            id: true,
            fullName: true,
            email: true,
        },
    },
};

// ==========================================
// HELPERS
// ==========================================

function normalizeOptionalString(value) {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
}

function buildProfileRequestData(data = {}) {
    const requestedFullName = normalizeOptionalString(
        data.requestedFullName
    );

    const requestedPhone = normalizeOptionalString(
        data.requestedPhone
    );

    if (!requestedFullName && !requestedPhone) {
        throw new Error("MEMBER_PROFILE_REQUEST_INVALID_DATA");
    }

    return {
        ...(requestedFullName
            ? { requestedFullName }
            : {}),

        ...(requestedPhone
            ? { requestedPhone }
            : {}),
    };
}

function buildPagination(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(
        100,
        Math.max(1, Number(limit) || 20)
    );

    return {
        page: safePage,
        limit: safeLimit,
        skip: (safePage - 1) * safeLimit,
    };
}

function mapProfileRequest(request) {
    if (!request) {
        return null;
    }

    return request;
}

// ==========================================
// CUSTOMER
// ==========================================

async function createProfileRequest(userId, data) {
    try {
        const requestData = buildProfileRequestData(data);

        return await prisma.memberProfileRequest.create({
            data: {
                userId,
                ...requestData,
            },
            select: PROFILE_REQUEST_SELECT,
        });
    } catch (error) {
        handleProfileRequestError(error);
    }
}

async function listMyProfileRequests(userId, filters = {}) {
    const { page, limit, skip } = buildPagination(
        filters.page,
        filters.limit
    );

    const where = {
        userId,
    };

    const [items, total] = await prisma.$transaction([
        prisma.memberProfileRequest.findMany({
            where,
            select: PROFILE_REQUEST_SELECT,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),

        prisma.memberProfileRequest.count({
            where,
        }),
    ]);

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

async function getMyProfileRequestById(userId, requestId) {
    const request = await prisma.memberProfileRequest.findFirst({
        where: {
            id: requestId,
            userId,
        },
        select: PROFILE_REQUEST_SELECT,
    });

    if (!request) {
        throw new Error("MEMBER_PROFILE_REQUEST_NOT_FOUND");
    }

    return mapProfileRequest(request);
}

// ==========================================
// ADMIN
// ==========================================

function buildAdminProfileRequestWhere(filters = {}) {
    const where = {};

    if (filters.customerId) {
        where.userId = filters.customerId;
    }

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.search) {
        where.OR = [
            {
                user: {
                    is: {
                        fullName: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                },
            },
            {
                user: {
                    is: {
                        email: {
                            contains: filters.search,
                            mode: "insensitive",
                        },
                    },
                },
            },
            {
                user: {
                    is: {
                        phone: {
                            contains: filters.search,
                        },
                    },
                },
            },
        ];
    }

    return where;
}

async function listProfileRequests(filters = {}) {
    const { page, limit, skip } = buildPagination(
        filters.page,
        filters.limit
    );

    const where = buildAdminProfileRequestWhere(filters);

    const [items, total] = await prisma.$transaction([
        prisma.memberProfileRequest.findMany({
            where,
            select: PROFILE_REQUEST_SELECT,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
        }),

        prisma.memberProfileRequest.count({
            where,
        }),
    ]);

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

async function getProfileRequestById(requestId) {
    const request = await prisma.memberProfileRequest.findUnique({
        where: {
            id: requestId,
        },
        select: PROFILE_REQUEST_SELECT,
    });

    if (!request) {
        throw new Error("MEMBER_PROFILE_REQUEST_NOT_FOUND");
    }

    return mapProfileRequest(request);
}

// ==========================================
// APPROVE
// ==========================================

async function approveProfileRequest(requestId, adminId, data = {}) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const request = await tx.memberProfileRequest.findUnique({
                    where: {
                        id: requestId,
                    },
                });

                if (!request) {
                    throw new Error("MEMBER_PROFILE_REQUEST_NOT_FOUND");
                }

                if (request.status !== "REQUESTED") {
                    throw new Error(
                        "MEMBER_PROFILE_REQUEST_CANNOT_BE_APPROVED"
                    );
                }

                const user = await tx.user.findUnique({
                    where: {
                        id: request.userId,
                    },
                    select: {
                        id: true,
                    },
                });

                if (!user) {
                    throw new Error("MEMBER_PROFILE_REQUEST_USER_NOT_FOUND");
                }

                const userUpdateData = {};

                if (request.requestedFullName !== null) {
                    userUpdateData.fullName = request.requestedFullName;
                }

                if (request.requestedPhone !== null) {
                    userUpdateData.phone = request.requestedPhone;
                }

                if (Object.keys(userUpdateData).length === 0) {
                    throw new Error("MEMBER_PROFILE_REQUEST_INVALID_DATA");
                }

                if (request.requestedPhone !== null) {
                    const existingPhone = await tx.user.findFirst({
                        where: {
                            phone: request.requestedPhone,
                            id: {
                                not: request.userId,
                            },
                        },
                        select: {
                            id: true,
                        },
                    });

                    if (existingPhone) {
                        throw new Error("PHONE_ALREADY_EXISTS");
                    }
                }

                const updatedRequest = await tx.memberProfileRequest.updateMany({
                    where: {
                        id: requestId,
                        status: "REQUESTED",
                    },
                    data: {
                        status: "APPROVED",
                        adminNote: normalizeOptionalString(data.adminNote) ?? null,
                        processedById: adminId,
                        processedAt: new Date(),
                    },
                });

                if (updatedRequest.count !== 1) {
                    throw new Error(
                        "MEMBER_PROFILE_REQUEST_CONCURRENT_UPDATE"
                    );
                }

                await tx.user.update({
                    where: {
                        id: request.userId,
                    },
                    data: userUpdateData,
                });

                return tx.memberProfileRequest.findUnique({
                    where: {
                        id: requestId,
                    },
                    select: PROFILE_REQUEST_SELECT,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleProfileRequestError(error);
    }
}

// ==========================================
// REJECT
// ==========================================

async function rejectProfileRequest(requestId, adminId, data = {}) {
    try {
        const rejectionReason = normalizeOptionalString(
            data.rejectionReason
        );

        if (!rejectionReason) {
            throw new Error(
                "MEMBER_PROFILE_REQUEST_REJECTION_REASON_REQUIRED"
            );
        }

        return await prisma.$transaction(
            async (tx) => {
                const request = await tx.memberProfileRequest.findUnique({
                    where: {
                        id: requestId,
                    },
                });

                if (!request) {
                    throw new Error("MEMBER_PROFILE_REQUEST_NOT_FOUND");
                }

                if (request.status !== "REQUESTED") {
                    throw new Error(
                        "MEMBER_PROFILE_REQUEST_CANNOT_BE_REJECTED"
                    );
                }

                const updatedRequest = await tx.memberProfileRequest.updateMany({
                    where: {
                        id: requestId,
                        status: "REQUESTED",
                    },
                    data: {
                        status: "REJECTED",
                        adminNote: rejectionReason,
                        processedById: adminId,
                        processedAt: new Date(),
                    },
                });

                if (updatedRequest.count !== 1) {
                    throw new Error(
                        "MEMBER_PROFILE_REQUEST_CONCURRENT_UPDATE"
                    );
                }

                return tx.memberProfileRequest.findUnique({
                    where: {
                        id: requestId,
                    },
                    select: PROFILE_REQUEST_SELECT,
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleProfileRequestError(error);
    }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    createProfileRequest,

    listMyProfileRequests,
    getMyProfileRequestById,

    listProfileRequests,
    getProfileRequestById,

    approveProfileRequest,
    rejectProfileRequest,
};
