import { Brand, Notice } from "../../components/auth/AuthComponents.jsx";

export default function Dashboard({
  user,
  onLogout,
  logoutLoading,
  logoutError,
}) {
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

          <Notice>{logoutError}</Notice>

          <button
            className="auth-submit"
            type="button"
            onClick={onLogout}
            disabled={logoutLoading}
          >
            {logoutLoading ? "ĐANG ĐĂNG XUẤT..." : "ĐĂNG XUẤT"}
            {!logoutLoading && <span aria-hidden="true"> ↗</span>}
          </button>
        </section>
      </div>
    </main>
  );
}
