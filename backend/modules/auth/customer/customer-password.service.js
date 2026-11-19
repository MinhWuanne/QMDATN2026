const prisma = require("../../../core/database/prisma");
const {
  hashPassword,
  verifyPassword,
} = require("../../../core/security/password");

async function changeCustomerPassword(userId, {
  currentPassword,
  newPassword,
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  if (user.role !== "CUSTOMER") {
    throw new Error("INVALID_USER_ROLE");
  }

  if (user.status !== "ACTIVE") {
    throw new Error("ACCOUNT_NOT_ACTIVE");
  }

  const isCurrentPasswordValid = await verifyPassword(
    user.passwordHash,
    currentPassword
  );

  if (!isCurrentPasswordValid) {
    throw new Error("CURRENT_PASSWORD_INVALID");
  }

  const newPasswordHash = await hashPassword(newPassword);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Chỉ cập nhật nếu passwordHash vẫn là giá trị vừa xác thực.
    // Tránh hai yêu cầu đồng thời cùng sử dụng một mật khẩu cũ.
    const updatedUser = await tx.user.updateMany({
      where: {
        id: user.id,
        role: "CUSTOMER",
        status: "ACTIVE",
        passwordHash: user.passwordHash,
      },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    if (updatedUser.count !== 1) {
      throw new Error("PASSWORD_CHANGE_CONFLICT");
    }

    // Thu hồi toàn bộ Refresh Token chưa bị thu hồi.
    const revokedSessions = await tx.refreshToken.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return {
      revokedCount: revokedSessions.count,
    };
  });

  return {
    success: true,
    revokedCount: result.revokedCount,
  };
}

module.exports = {
  changeCustomerPassword,
};