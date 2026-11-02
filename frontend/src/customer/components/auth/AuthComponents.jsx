import { useState } from "react";

export function Brand() {
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

export function AuthLayout({ eyebrow, title, description, children, footer }) {
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

export function Notice({ type = "error", children }) {
  if (!children) return null;
  return <div className={`auth-notice ${type}`}>{children}</div>;
}

export function TextField({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
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
        inputMode={inputMode}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}

export function PasswordField({
  label,
  id,
  value,
  onChange,
  placeholder = "Nhập mật khẩu",
  autoComplete = "current-password",
  minLength = 8,
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
          minLength={minLength}
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

export function SubmitButton({ loading, children }) {
  return (
    <button className="auth-submit" type="submit" disabled={loading}>
      {loading ? "ĐANG XỬ LÝ..." : children}
      {!loading && <span aria-hidden="true"> ↗</span>}
    </button>
  );
}
