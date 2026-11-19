const prisma = require("../../core/database/prisma");
const { Prisma } = require("@prisma/client");

const MAX_ADDRESSES_PER_USER = 5;

function handleAddressError(error) {
    if (
        error.code === "P2034" ||
        error.code === "P2002"
    ) {
        throw new Error("ADDRESS_CONCURRENT_UPDATE");
    }

    throw error;
}

async function listMyAddresses(userId) {
    return prisma.address.findMany({
        where: { userId },
        orderBy: [
            { isDefault: "desc" },
            { createdAt: "desc" },
            { id: "asc" },
        ],
    });
}

async function createMyAddress(userId, input) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const count = await tx.address.count({
                    where: { userId },
                });

                if (count >= MAX_ADDRESSES_PER_USER) {
                    throw new Error("ADDRESS_LIMIT_REACHED");
                }

                const shouldBeDefault =
                    input.isDefault === true || count === 0;

                if (shouldBeDefault) {
                    await tx.address.updateMany({
                        where: {
                            userId,
                            isDefault: true,
                        },
                        data: {
                            isDefault: false,
                        },
                    });
                }

                const {
                    isDefault,
                    ...addressData
                } = input;

                return tx.address.create({
                    data: {
                        ...addressData,
                        userId,
                        isDefault: shouldBeDefault,
                    },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleAddressError(error);
    }
}

async function updateMyAddress(userId, addressId, input) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const existing = await tx.address.findFirst({
                    where: {
                        id: addressId,
                        userId,
                    },
                    select: { id: true },
                });

                if (!existing) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                const updated = await tx.address.updateMany({
                    where: {
                        id: addressId,
                        userId,
                    },
                    data: input,
                });

                if (updated.count !== 1) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                return tx.address.findFirst({
                    where: {
                        id: addressId,
                        userId,
                    },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleAddressError(error);
    }
}

async function setMyDefaultAddress(userId, addressId) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const address = await tx.address.findFirst({
                    where: {
                        id: addressId,
                        userId,
                    },
                });

                if (!address) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                if (address.isDefault) {
                    return address;
                }

                await tx.address.updateMany({
                    where: {
                        userId,
                        isDefault: true,
                    },
                    data: {
                        isDefault: false,
                    },
                });

                const updated = await tx.address.updateMany({
                    where: {
                        id: addressId,
                        userId,
                    },
                    data: {
                        isDefault: true,
                    },
                });

                if (updated.count !== 1) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                return tx.address.findFirst({
                    where: {
                        id: addressId,
                        userId,
                    },
                });
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleAddressError(error);
    }
}

async function deleteMyAddress(userId, addressId) {
    try {
        return await prisma.$transaction(
            async (tx) => {
                const address = await tx.address.findFirst({
                    where: {
                        id: addressId,
                        userId,
                    },
                });

                if (!address) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                const deleted = await tx.address.deleteMany({
                    where: {
                        id: addressId,
                        userId,
                    },
                });

                if (deleted.count !== 1) {
                    throw new Error("ADDRESS_NOT_FOUND");
                }

                let newDefaultAddress = null;

                if (address.isDefault) {
                    const nextAddress = await tx.address.findFirst({
                        where: { userId },
                        orderBy: [
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                    });

                    if (nextAddress) {
                        await tx.address.updateMany({
                            where: {
                                id: nextAddress.id,
                                userId,
                            },
                            data: {
                                isDefault: true,
                            },
                        });

                        newDefaultAddress = {
                            ...nextAddress,
                            isDefault: true,
                        };
                    }
                }

                return {
                    deletedAddressId: addressId,
                    newDefaultAddress,
                };
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        handleAddressError(error);
    }
}

module.exports = {
    MAX_ADDRESSES_PER_USER,
    listMyAddresses,
    createMyAddress,
    updateMyAddress,
    setMyDefaultAddress,
    deleteMyAddress,
};
