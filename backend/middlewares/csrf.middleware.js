
const ALLOWED_ORIGINS = new Set(
  (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function csrfProtection(req, res, next) {
  const origin = req.get("origin");

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({
      success: false,
      message: "CSRF_VALIDATION_FAILED",
    });
  }

  next();
}

module.exports = csrfProtection;
