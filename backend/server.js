
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

require("dotenv").config();

const prisma = require("./lib/prisma");

const authRoutes = require("./routes/auth.routes");
const adminAuthRoutes = require("./routes/admin-auth.routes");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

const PORT = process.env.PORT || 3000;

// Render runs behind a reverse proxy.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Allowed frontend origins
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Security middleware
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// General authentication rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "TOO_MANY_REQUESTS",
  },
});

// Health
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running!",
  });
});

// Database health
app.get("/api/db-health", async (req, res) => {
  try {
    const [database] = await prisma.$queryRaw`
      SELECT NOW() AS database_time, version() AS database_version
    `;

    res.json({
      success: true,
      message: "PostgreSQL connected successfully!",
      database,
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    console.error("Error code:", error.code);
    console.error("Error detail:", error.detail);
    console.error("Error cause:", error.cause);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Authentication routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin/auth", authLimiter, adminAuthRoutes);

// Error handler must be registered last.
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
