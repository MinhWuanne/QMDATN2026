
const prisma = require("../../core/database/prisma");
const { Prisma } = require("@prisma/client");

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_MESSAGE_LIMIT = 50;
const DEFAULT_CONVERSATION_LIMIT = 20;

// ==========================================
// TRANSACTION
// ==========================================

async function runSerializableTransaction(callback) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await prisma.$transaction(
                callback,
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                }
            );
        } catch (error) {
            if (
                error.code === "P2034" &&
                attempt < maxAttempts
            ) {
                continue;
            }

            if (error.code === "P2034") {
                throw new Error("CHAT_CONCURRENT_UPDATE");
            }

            throw error;
        }
    }
}

// ==========================================
// MESSAGE PAGINATION
// ==========================================

async function getMessagePage(conversationId, query = {}) {
    const limit = query.limit ?? DEFAULT_MESSAGE_LIMIT;
    const cursor = query.cursor;

    if (cursor) {
        const cursorMessage = await prisma.chatMessage.findFirst({
            where: {
                id: cursor,
                conversationId,
            },
            select: {
                id: true,
            },
        });

        if (!cursorMessage) {
            throw new Error("CHAT_MESSAGE_CURSOR_INVALID");
        }
    }

    const messages = await prisma.chatMessage.findMany({
        where: {
            conversationId,
        },

        ...(cursor
            ? {
                cursor: {
                    id: cursor,
                },
                skip: 1,
            }
            : {}),

        take: limit + 1,

        orderBy: [
            {
                createdAt: "desc",
            },
            {
                id: "desc",
            },
        ],

        include: {
            sender: {
                select: {
                    id: true,
                    fullName: true,
                    role: true,
                },
            },
        },
    });

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit);

    // Return messages in chronological order for the frontend.
    items.reverse();

    return {
        items,

        nextCursor: hasMore && items.length > 0
            ? items[0].id
            : null,
    };
}

// ==========================================
// MEMBER: GET MESSAGES
// ==========================================

async function getMemberMessages(customerId, query = {}) {
    const conversation = await prisma.chatConversation.findUnique({
        where: {
            customerId,
        },

        select: {
            id: true,
            status: true,
            lastMessageAt: true,
        },
    });

    if (!conversation) {
        return {
            conversation: null,
            items: [],
            nextCursor: null,
        };
    }

    // Mark Admin messages as read when Member opens the conversation.
    await prisma.chatMessage.updateMany({
        where: {
            conversationId: conversation.id,
            senderId: {
                not: customerId,
            },
            readAt: null,
        },

        data: {
            readAt: new Date(),
        },
    });

    const messagePage = await getMessagePage(
        conversation.id,
        query
    );

    return {
        conversation,
        ...messagePage,
    };
}

// ==========================================
// MEMBER: SEND MESSAGE
// ==========================================

async function sendMemberMessage(customerId, input) {
    return runSerializableTransaction(async (tx) => {
        // One Customer can only have one support conversation.
        // Sending a message automatically reopens a closed conversation.
        const conversation = await tx.chatConversation.upsert({
            where: {
                customerId,
            },

            create: {
                customerId,
                status: "OPEN",
            },

            update: {
                status: "OPEN",
            },

            select: {
                id: true,
                status: true,
            },
        });

        const message = await tx.chatMessage.create({
            data: {
                conversationId: conversation.id,
                senderId: customerId,
                content: input.content,
            },

            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        role: true,
                    },
                },
            },
        });

        await tx.chatConversation.update({
            where: {
                id: conversation.id,
            },

            data: {
                status: "OPEN",
                lastMessageAt: message.createdAt,
            },
        });

        return {
            conversation: {
                id: conversation.id,
                status: "OPEN",
                lastMessageAt: message.createdAt,
            },
            message,
        };
    });
}

// ==========================================
// ADMIN: LIST CONVERSATIONS
// ==========================================

async function listAdminConversations(adminId, query = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_CONVERSATION_LIMIT;
    const skip = (page - 1) * limit;

    const where = {
        ...(query.status
            ? {
                status: query.status,
            }
            : {}),

        ...(query.search
            ? {
                customer: {
                    is: {
                        OR: [
                            {
                                fullName: {
                                    contains: query.search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                email: {
                                    contains: query.search,
                                    mode: "insensitive",
                                },
                            },
                        ],
                    },
                },
            }
            : {}),
    };

    const [conversations, total] = await prisma.$transaction([
        prisma.chatConversation.findMany({
            where,
            skip,
            take: limit,

            orderBy: [
                {
                    lastMessageAt: "desc",
                },
                {
                    id: "asc",
                },
            ],

            select: {
                id: true,
                status: true,
                lastMessageAt: true,
                createdAt: true,

                customer: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        phone: true,
                        status: true,
                    },
                },

                messages: {
                    take: 1,

                    orderBy: [
                        {
                            createdAt: "desc",
                        },
                        {
                            id: "desc",
                        },
                    ],

                    select: {
                        id: true,
                        content: true,
                        senderId: true,
                        createdAt: true,
                    },
                },
            },
        }),

        prisma.chatConversation.count({
            where,
        }),
    ]);

    const conversationIds = conversations.map(
        (conversation) => conversation.id
    );

    let unreadCounts = [];

    if (conversationIds.length > 0) {
        unreadCounts = await prisma.chatMessage.groupBy({
            by: ["conversationId"],

            where: {
                conversationId: {
                    in: conversationIds,
                },

                sender: {
                    is: {
                        role: "CUSTOMER",
                    },
                },
                readAt: null,
            },

            _count: {
                _all: true,
            },
        });
    }

    const unreadMap = new Map(
        unreadCounts.map((item) => [
            item.conversationId,
            item._count._all,
        ])
    );

    const items = conversations.map((conversation) => {
        const { messages, ...data } = conversation;

        return {
            ...data,
            lastMessage: messages[0] ?? null,
            unreadCount: unreadMap.get(conversation.id) ?? 0,
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
// ADMIN: GET CONVERSATION MESSAGES
// ==========================================

async function getAdminConversationMessages(
    conversationId,
    adminId,
    query = {}
) {
    const conversation = await prisma.chatConversation.findUnique({
        where: {
            id: conversationId,
        },

        select: {
            id: true,
            status: true,
            lastMessageAt: true,

            customer: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    phone: true,
                },
            },
        },
    });

    if (!conversation) {
        throw new Error("CHAT_CONVERSATION_NOT_FOUND");
    }

    // Mark Customer messages as read when Admin opens the conversation.
    await prisma.chatMessage.updateMany({
        where: {
            conversationId,
            sender: {
                is: {
                    role: "CUSTOMER",
                },
            },
            readAt: null,
        },

        data: {
            readAt: new Date(),
        },
    });

    const messagePage = await getMessagePage(
        conversationId,
        query
    );

    return {
        conversation,
        ...messagePage,
    };
}

// ==========================================
// ADMIN: SEND MESSAGE
// ==========================================

async function sendAdminMessage(conversationId, adminId, input) {
    return runSerializableTransaction(async (tx) => {
        const conversation = await tx.chatConversation.findUnique({
            where: {
                id: conversationId,
            },

            select: {
                id: true,
                status: true,
            },
        });

        if (!conversation) {
            throw new Error("CHAT_CONVERSATION_NOT_FOUND");
        }

        if (conversation.status !== "OPEN") {
            throw new Error("CHAT_CONVERSATION_CLOSED");
        }

        const message = await tx.chatMessage.create({
            data: {
                conversationId,
                senderId: adminId,
                content: input.content,
            },

            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true,
                        role: true,
                    },
                },
            },
        });

        await tx.chatConversation.update({
            where: {
                id: conversationId,
            },

            data: {
                lastMessageAt: message.createdAt,
            },
        });

        return {
            conversation: {
                id: conversationId,
                status: "OPEN",
                lastMessageAt: message.createdAt,
            },
            message,
        };
    });
}

// ==========================================
// ADMIN: CLOSE CONVERSATION
// ==========================================

async function closeConversation(conversationId) {
    return runSerializableTransaction(async (tx) => {
        const conversation = await tx.chatConversation.findUnique({
            where: {
                id: conversationId,
            },

            select: {
                id: true,
                status: true,
            },
        });

        if (!conversation) {
            throw new Error("CHAT_CONVERSATION_NOT_FOUND");
        }

        if (conversation.status === "CLOSED") {
            throw new Error("CHAT_CONVERSATION_ALREADY_CLOSED");
        }

        return tx.chatConversation.update({
            where: {
                id: conversationId,
            },

            data: {
                status: "CLOSED",
            },

            select: {
                id: true,
                status: true,
                lastMessageAt: true,
                updatedAt: true,
            },
        });
    });
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    getMemberMessages,
    sendMemberMessage,

    listAdminConversations,
    getAdminConversationMessages,
    sendAdminMessage,
    closeConversation,
};
