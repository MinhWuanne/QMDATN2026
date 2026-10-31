import { useEffect, useState } from "react";
import "./App.css";

const API = "/api/auth";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const code = data.message;
    const messages = {
      INVALID_CREDENTIALS: "Email, số điện thoại hoặc mật khẩu không chính xác.",
      EMAIL_NOT_VERIFIED: "Email của bạn chưa được xác minh.",
      ACCOUNT_LOCKED: "Tài khoản đã bị khóa.",
      ACCOUNT_NOT_ACTIVE: "Tài khoản hiện không hoạt động.",
      EMAIL_ALREADY_EXISTS: "Email này đã được sử dụng.",
      PHONE_ALREADY_EXISTS: "Số điện thoại này đã được sử dụng.",
      REGISTRATION_EMAIL_DELIVERY_FAILED:
        "Không thể gửi mã xác minh. Vui lòng liên hệ hỗ trợ.",
      INVALID_OR_EXPIRED_RESET_TOKEN:
        "Liên kết đã hết hạn hoặc không còn hợp lệ. Hãy yêu cầu liên kết mới.",
      OTP_INVALID_OR_UNAVAILABLE:
        "Mã xác minh không chính xác hoặc đã hết hạn.",
      CSRF_VALIDATION_FAILED:
        "Yêu cầu bảo mật không hợp lệ. Vui lòng tải lại trang.",
    };

    const detail = Array.isArray(data.details)
      ? data.details[0]?.message
      : Object.values(data.details || {}).flat()[0];

    throw new Error(
      messages[code] || detail || code || "Đã xảy ra lỗi. Vui lòng thử lại."
    );
  }

  return data;
}

function Brand() {
  return (
    <a className="auth-brand" href="/" aria-label="QMDATN2026">
      <span className="auth-brand-mark">Q</span>
      <span className="auth-brand-name">
        QMDATN2026
        <small>BADMINTON STORE</small>
      </span>
    </a>
  );
}

function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Brand />
        <section className="auth-card">
          <div className="auth-heading">
            <span className="auth-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </section>
        <p className="auth-bottom">YOUR GAME. YOUR PASSION.</p>
      </div>
    </main>
  );
}

function Notice({ type = "error", children }) {
  if (!children) return null;
  return <div className={`auth-notice ${type}`}>{children}</div>;
}

function TextField({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  maxLength,
}) {
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}

function PasswordField({
  label,
  id,
  value,
  onChange,
  placeholder = "Nhập mật khẩu",
  autoComplete = "current-password",
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <div className="auth-password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={8}
          required
        />
        <button
          className="auth-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        >
          {visible ? "ẨN" : "HIỆN"}
        </button>
      </div>
    </label>
  );
}

function SubmitButton({ loading, children }) {
  return (
    <button className="auth-submit" type="submit" disabled={loading}>
      {loading ? "ĐANG XỬ LÝ..." : children}
      {!loading && <span aria-hidden="true">↗</span>}
    </button>
  );
}

function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const verified = new URLSearchParams(window.location.search).get("verified");

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
      {verified === "1" && (
        <Notice type="success">Email đã được xác minh. Bạn có thể đăng nhập.</Notice>
      )}
      <form className="auth-form" onSubmit={handleSubmit}>
        <TextField
          id="identifier"
          label="Email hoặc số điện thoại"
          value={identifier}
          onChange={setIdentifier}
          placeholder="Nhập email hoặc số điện thoại"
          autoComplete="username"
        />
        <PasswordField
          id="login-password"
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
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

function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

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
          fullName,
          email,
          phone,
          password,
        }),
      });

      window.location.href = `/verify-email?email=${encodeURIComponent(email.trim())}`;
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

function VerifyEmail() {
  const email = new URLSearchParams(window.location.search).get("email") || "";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

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
          maxLength={6}
        />
        <Notice>{error}</Notice>
        <SubmitButton loading={loading}>XÁC MINH EMAIL</SubmitButton>
      </form>
    </AuthLayout>
  );
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiRequest("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
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
        <Notice type="success">
          Nếu email thuộc về một tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư và thư mục spam.
        </Notice>
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
          />
          <Notice>{error}</Notice>
          <SubmitButton loading={loading}>GỬI LIÊN KẾT</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
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
        body: JSON.stringify({ token, newPassword: password }),
      });
      setCompleted(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
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
      footer={
        <a href="/login">Quay lại đăng nhập</a>
      }
    >
      {completed ? (
        <Notice type="success">Mật khẩu đã được thay đổi thành công.</Notice>
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

function Dashboard({ user, onLogout }) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Brand />
        <section className="auth-card">
          <span className="auth-eyebrow">ACCOUNT</span>
          <h1>Xin chào, {user?.fullName || "bạn"}!</h1>
          <p>Bạn đã đăng nhập thành công.</p>
          <div className="auth-user-info">
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>Vai trò:</strong> {user?.role}</p>
          </div>
          <button className="auth-submit" type="button" onClick={onLogout}>
            ĐĂNG XUẤT <span aria-hidden="true">↗</span>
          </button>
        </section>
      </div>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    apiRequest("/refresh", { method: "POST" })
      .then((data) => {
        if (active) {
          setSession({
            accessToken: data.tokens?.accessToken,
            user: data.user || null,
          });
        }
      })
      .catch(() => {
        // Chưa có phiên đăng nhập hoặc phiên đã hết hạn.
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await apiRequest("/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setSession(null);
      window.location.href = "/login";
    }
  }

  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (checkingSession) {
    return (
      <main className="auth-loading">
        <span className="auth-brand-mark">Q</span>
        <p>Đang kiểm tra phiên đăng nhập...</p>
      </main>
    );
  }

  if (session) {
    return <Dashboard user={session.user} onLogout={handleLogout} />;
  }

  switch (path) {
    case "/register":
      return <Register />;
    case "/verify-email":
      return <VerifyEmail />;
    case "/forgot-password":
      return <ForgotPassword />;
    case "/reset-password":
      return <ResetPassword />;
    case "/login":
    case "/":
    default:
      return (
        <Login
          onLogin={(data) =>
            setSession({
              accessToken: data.tokens?.accessToken,
              user: data.user,
            })
          }
        />
      );
  }
}

export default App;
