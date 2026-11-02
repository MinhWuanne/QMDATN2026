
import { useState } from "react";
import { apiRequest } from "../../services/auth.service.js";
import {
  AuthLayout,
  Notice,
  TextField,
  SubmitButton,
} from "../../components/auth/AuthComponents.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Vui lòng nhập email đăng ký.");
      return;
    }

    setLoading(true);

    try {
      await apiRequest("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });

      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="ACCOUNT RECOVERY"
      title="Quên mật khẩu?"
      description="Nhập email đã đăng ký. Nếu tài khoản hợp lệ, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu."
      footer={
        <>
          Nhớ mật khẩu rồi? <a href="/login">Quay lại đăng nhập</a>
        </>
      }
    >
      {sent ? (
        <>
          <Notice type="success">
            Nếu email thuộc về một tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư và thư mục spam.
          </Notice>

          <div className="auth-resend">
            <button
              className="auth-resend-button"
              type="button"
              onClick={() => {
                setSent(false);
                setError("");
              }}
            >
              THỬ VỚI EMAIL KHÁC
            </button>
          </div>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <TextField
            id="forgot-email"
            label="Email đăng ký"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="example@email.com"
            autoComplete="email"
            maxLength={255}
          />

          <Notice>{error}</Notice>
          <SubmitButton loading={loading}>
            GỬI LIÊN KẾT
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
