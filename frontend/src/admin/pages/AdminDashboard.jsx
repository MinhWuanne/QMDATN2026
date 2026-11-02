export default function AdminDashboard({ user, onLogout, logoutLoading, error }) {
  return (
    <main className="admin-dashboard">
      <header className="admin-topbar">
        <div className="admin-logo">
          <span>Q</span>
          <div>
            <strong>QMDATN2026</strong>
            <small>ADMINISTRATION</small>
          </div>
        </div>
        <button
          className="admin-logout"
          onClick={onLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? "ĐANG ĐĂNG XUẤT..." : "ĐĂNG XUẤT"}
        </button>
      </header>

      <section className="admin-dashboard-content">
        <span className="admin-dashboard-eyebrow">OVERVIEW</span>
        <h1>Xin chào, {user?.fullName || "Quản trị viên"}.</h1>
        <p>Bạn đã đăng nhập vào hệ thống quản trị.</p>

        <div className="admin-welcome-card">
          <span>ADMIN ACCOUNT</span>
          <h2>{user?.fullName || "Quản trị viên"}</h2>
          <p>{user?.email}</p>
          <p>Vai trò: {user?.role}</p>
        </div>

        {error && <p className="admin-login-error">{error}</p>}
      </section>
    </main>
  );
}
