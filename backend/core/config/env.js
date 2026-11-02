require("dotenv").config();

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getSecret(name, minLength = 32) {
  const value = getRequiredEnv(name);

  if (Buffer.byteLength(value, "utf8") < minLength) {
    throw new Error(`${name} must be at least ${minLength} bytes`);
  }

  return value;
}

module.exports = {
  getRequiredEnv,
  getSecret,
};