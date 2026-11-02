

import { useState } from "react";
import { apiRequest } from "../../services/auth.service.js";
import {
  AuthLayout,
  Notice,
  TextField,
  PasswordField,
  SubmitButton,
} from "../../components/auth/AuthComponents.jsx";

export default function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const verified = params.get("verified") === "1";

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const normalizedIdentifier = identifier.trim();

    if (!normalizedIdentifier || !password) {
      setError("Vui lòng nhập đầy đủ thông tin đăng nhập.");
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: normalizedIdentifier,
          password,
        }),
      });

      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="WELCOME BACK"
      title="Đăng nhập"
      description="Đăng nhập để tiếp tục hành trình của bạn."
      footer={
        <>
          Chưa có tài khoản? <a href="/register">Tạo tài khoản</a>
        </>
      }
    >
      {verified && (
        <Notice type="success">
          Email đã được xác minh. Bạn có thể đăng nhập.
        </Notice>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="identifier"
          label="Email hoặc số điện thoại"
          value={identifier}
          onChange={setIdentifier}
          placeholder="Nhập email hoặc số điện thoại"
          autoComplete="username"
          maxLength={255}
        />

        <PasswordField
          id="login-password"
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
          minLength={1}
        />

        <div className="auth-inline-link">
          <a href="/forgot-password">Quên mật khẩu?</a>
        </div>

        <Notice>{error}</Notice>

        <SubmitButton loading={loading}>ĐĂNG NHẬP</SubmitButton>
      </form>
    </AuthLayout>
  );
}
