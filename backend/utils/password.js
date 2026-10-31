const argon2 = require("argon2");

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

const DUMMY_PASSWORD_HASH = hashPassword(
  "QMDATN2026-DUMMY-PASSWORD-NEVER-USE"
);

module.exports = {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
};