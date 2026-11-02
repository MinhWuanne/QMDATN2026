
import { useEffect, useState } from "react";
import { apiRequest } from "../../services/auth.service.js";
import {
  AuthLayout,
  Notice,
  TextField,
  SubmitButton,
} from "../../components/auth/AuthComponents.jsx";

const RESEND_INTERVAL = 60;

export default function VerifyEmail() {
  const email = (
    new URLSearchParams(window.location.search).get("email") || ""
  ).trim().toLowerCase();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_INTERVAL);

  useEffect(() => {
    if (countdown <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || resending) return;

    setError("");
    setSuccess("");

    if (!email) {
      setError("Không tìm thấy email cần xác minh. Vui lòng đăng ký lại.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError("Mã xác minh phải gồm đúng 6 chữ số.");
      return;
    }

    setLoading(true);

    try {
      await apiRequest("/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });

      window.location.href = "/login?verified=1";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || countdown > 0 || resending || loading) return;

    setError("");
    setSuccess("");
    setResending(true);

    try {
      const result = await apiRequest("/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      setCountdown(RESEND_INTERVAL);
      setSuccess(
        result.message ||
          "Nếu tài khoản cần xác minh và đủ điều kiện, mã OTP sẽ được gửi đến email."
      );
      setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  const formatCountdown = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  return (
    <AuthLayout
      eyebrow="EMAIL VERIFICATION"
      title="Xác minh email"
      description={
        email
          ? `Nhập mã xác minh 6 chữ số đã được gửi đến ${email}.`
          : "Không tìm thấy địa chỉ email cần xác minh."
      }
      footer={
        <>
          Đã xác minh? <a href="/login">Đăng nhập</a>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="verification-code"
          label="Mã xác minh"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          required
        />

        <Notice>{error}</Notice>
        <Notice type="success">{success}</Notice>

        <SubmitButton loading={loading}>
          XÁC MINH EMAIL
        </SubmitButton>
      </form>

      <div className="auth-resend">
        <p>Chưa nhận được mã xác minh?</p>

        <button
          className="auth-resend-button"
          type="button"
          onClick={handleResend}
          disabled={!email || countdown > 0 || resending || loading}
        >
          {resending
            ? "ĐANG GỬI..."
            : countdown > 0
              ? `GỬI LẠI MÃ SAU ${formatCountdown(countdown)}`
              : "GỬI LẠI MÃ XÁC MINH"}
        </button>
      </div>
    </AuthLayout>
  );
}
