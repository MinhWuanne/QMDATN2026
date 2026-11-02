

import { useState } from "react";
import { apiRequest } from "../../services/auth.service.js";
import {
  AuthLayout,
  Notice,
  TextField,
  PasswordField,
  SubmitButton,
} from "../../components/auth/AuthComponents.jsx";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const normalizedFullName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    if (!normalizedFullName || !normalizedEmail) {
      setError("Vui lòng nhập họ tên và email.");
      return;
    }

    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({
          fullName: normalizedFullName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
        }),
      });

      window.location.href = `/verify-email?email=${encodeURIComponent(normalizedEmail)}`;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="JOIN OUR COMMUNITY"
      title="Tạo tài khoản"
      description="Đăng ký để khám phá thế giới cầu lông."
      footer={
        <>
          Đã có tài khoản? <a href="/login">Đăng nhập</a>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="fullName"
          label="Họ và tên"
          value={fullName}
          onChange={setFullName}
          placeholder="Nguyễn Văn A"
          autoComplete="name"
          maxLength={150}
        />

        <TextField
          id="register-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="example@email.com"
          autoComplete="email"
          maxLength={255}
        />

        <TextField
          id="phone"
          label="Số điện thoại"
          value={phone}
          onChange={setPhone}
          placeholder="Không bắt buộc"
          autoComplete="tel"
          required={false}
          maxLength={20}
        />

        <PasswordField
          id="register-password"
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
        />

        <PasswordField
          id="register-confirm"
          label="Xác nhận mật khẩu"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
        />

        <Notice>{error}</Notice>

        <SubmitButton loading={loading}>TẠO TÀI KHOẢN</SubmitButton>
      </form>
    </AuthLayout>
  );
}
