import { useState } from "react";
import { adminAuthRequest } from "../../services/admin-auth.service.js";

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    setLoading(true);

    try {
      const data = await adminAuthRequest("/login", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      if (data.user?.role !== "ADMIN" || !data.tokens?.accessToken) {
        throw new Error("Dữ liệu phiên đăng nhập không hợp lệ.");
      }

      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-login-card">
        <div className="admin-logo">
          <span>Q</span>
          <div>
            <strong>QMDATN2026</strong>
            <small>ADMINISTRATION</small>
          </div>
        </div>

        <div className="admin-login-heading">
          <span>ADMIN PORTAL</span>
          <h1>Đăng nhập quản trị</h1>
          <p>Đăng nhập để quản lý cửa hàng của bạn.</p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>
            Email quản trị
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="username"
              maxLength={255}
              required
            />
          </label>

          <label>
            Mật khẩu
            <div className="admin-password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "ẨN" : "HIỆN"}
              </button>
            </div>
          </label>

          {error && (
            <div className="admin-login-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="admin-login-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "ĐANG ĐĂNG NHẬP..." : "ĐĂNG NHẬP"}
            {!loading && <span>↗</span>}
          </button>
        </form>

        <p className="admin-login-footer">
          HỆ THỐNG QUẢN TRỊ · QMDATN2026
        </p>
      </section>
    </main>
  );
}
