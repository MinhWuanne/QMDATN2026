const crypto = require("node:crypto");

function generateOtp() {
  return crypto.randomInt(0, 1000000)
    .toString()
    .padStart(6, "0");
}

function hashOtp({ userId, purpose, code }, secret) {
  if (!secret || secret.length < 32) {
    throw new Error("OTP_HASH_SECRET must be at least 32 characters");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${purpose}:${code}`)
    .digest("hex");
}

function verifyOtp({ userId, purpose, code, storedHash }, secret) {
  if (!/^\d{6}$/.test(code || "")) {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(storedHash || "")) {
    return false;
  }

  const calculatedHash = hashOtp(
    { userId, purpose, code },
    secret
  );

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHash, "hex"),
    Buffer.from(storedHash, "hex")
  );
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
};