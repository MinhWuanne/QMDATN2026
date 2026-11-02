import { useState } from "react";
import { apiRequest } from "../../services/auth.service.js";
import {
  AuthLayout,
  Notice,
  PasswordField,
  SubmitButton,
} from "../../components/auth/AuthComponents.jsx";

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu token.");
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
      await apiRequest("/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      });

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("token");

      window.history.replaceState(
        {},
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      );

      setCompleted(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Không thể đặt lại mật khẩu. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="SECURE YOUR ACCOUNT"
      title={completed ? "Đổi mật khẩu thành công" : "Đặt lại mật khẩu"}
      description={
        completed
          ? "Mật khẩu của bạn đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới."
          : "Tạo mật khẩu mới để tiếp tục sử dụng tài khoản."
      }
      footer={<a href="/login">Quay lại đăng nhập</a>}
    >
      {completed ? (
        <Notice type="success">
          Mật khẩu đã được thay đổi thành công.
        </Notice>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <PasswordField
            id="new-password"
            label="Mật khẩu mới"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
          />

          <PasswordField
            id="confirm-new-password"
            label="Xác nhận mật khẩu mới"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
          />

          <Notice>{error}</Notice>
          <SubmitButton loading={loading}>ĐỔI MẬT KHẨU</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}