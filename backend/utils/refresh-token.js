
const crypto = require("node:crypto");

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashRefreshToken(token) {
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    throw new Error("INVALID_REFRESH_TOKEN");
  }

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

module.exports = {
  generateRefreshToken,
  hashRefreshToken,
};
