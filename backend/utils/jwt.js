
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const { getSecret } = require("../config/env");

const ACCESS_TOKEN_TTL = "15m";
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "qmdatn2026-api";
const JWT_AUDIENCE = "qmdatn2026-web";

const ALLOWED_ROLES = ["CUSTOMER", "ADMIN"];

function getJwtSecret() {
  return getSecret("JWT_ACCESS_SECRET", 32);
}

function signAccessToken({ userId, role }) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("INVALID_TOKEN_SUBJECT");
  }

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error("INVALID_TOKEN_ROLE");
  }

  return jwt.sign(
    { role },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHM,
      subject: userId,
      jwtid: crypto.randomUUID(),
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

function verifyAccessToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("INVALID_ACCESS_TOKEN");
  }

  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    !ALLOWED_ROLES.includes(payload.role) ||
    typeof payload.jti !== "string" ||
    !payload.jti
  ) {
    throw new Error("INVALID_ACCESS_TOKEN");
  }

  return {
    userId: payload.sub,
    role: payload.role,
    tokenId: payload.jti,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TOKEN_TTL,
};
