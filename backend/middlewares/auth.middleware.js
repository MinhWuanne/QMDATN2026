
const { verifyAccessToken } = require("../utils/jwt");
const prisma = require("../lib/prisma");

async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "UNAUTHORIZED",
      });
    }

    const token = authorization.slice(7).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        message: "UNAUTHORIZED",
      });
    }

    if (user.role !== payload.role) {
      return res.status(401).json({
        success: false,
        message: "INVALID_ACCESS_TOKEN",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError" ||
        error.message === "INVALID_ACCESS_TOKEN") {
      return res.status(401).json({
        success: false,
        message: "INVALID_ACCESS_TOKEN",
      });
    }

    next(error);
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "UNAUTHORIZED",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "FORBIDDEN",
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  authorize,
};
