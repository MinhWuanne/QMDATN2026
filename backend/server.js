const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Kiểm tra backend
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running!",
  });
});

// Kiểm tra PostgreSQL
app.get("/api/db-health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS database_time, version() AS database_version"
    );

    res.json({
      success: true,
      message: "PostgreSQL connected successfully!",
      database: result.rows[0],
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});