const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

if (!process.env.DATABASE_CA_CERT_BASE64) {
  throw new Error("DATABASE_CA_CERT_BASE64 is missing");
}

const ca = Buffer.from(
  process.env.DATABASE_CA_CERT_BASE64,
  "base64"
).toString("utf8");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
});

module.exports = pool;