
import { useEffect, useState } from "react";
import CatalogManagementPage from "./catalog/CatalogManagementPage.jsx";
import ProductManagementPage from "./catalog/ProductManagementPage.jsx";
import InventoryManagementPage from "./inventory/InventoryManagementPage.jsx";
import OrderManagementPage from "./orders/OrderManagementPage.jsx";
import VoucherManagementPage from "./vouchers/VoucherManagementPage.jsx";
import MemberManagementPage from "./members/MemberManagementPage.jsx";

const navigation = [
  {
    label: "TỔNG QUAN",
    items: [
      { title: "Dashboard", path: "/admin", icon: "▦" },
    ],
  },
  {
    label: "QUẢN LÝ CỬA HÀNG",
    items: [
      { title: "Danh mục", path: "/admin/categories", icon: "▤" },
      { title: "Thương hiệu", path: "/admin/brands", icon: "◇" },
      { title: "Sản phẩm", path: "/admin/products", icon: "□" },
      { title: "Kho hàng", path: "/admin/inventory", icon: "▥" },
    ],
  },
  {
    label: "GIAO DỊCH",
    items: [
      { title: "Đơn hàng", path: "/admin/orders", icon: "▧" },
      { title: "Voucher", path: "/admin/vouchers", icon: "％" },
    ],
  },
  {
    label: "KHÁCH HÀNG",
    items: [
      { title: "Thành viên", path: "/admin/members", icon: "♙" },
    ],
  },
];

function getCurrentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/admin";
}

export default function AdminDashboard({
  user,
  accessToken,
  onSessionUpdate,
  onLogout,
  logoutLoading,
  error,
}) {
  const [currentPath, setCurrentPath] = useState(getCurrentPath());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(getCurrentPath());
      setSidebarOpen(false);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function navigate(path) {
    if (path === currentPath) {
      setSidebarOpen(false);
      return;
    }

    window.history.pushState({}, "", path);
    setCurrentPath(path);
    setSidebarOpen(false);
  }

  const currentItem = navigation
    .flatMap((group) => group.items)
    .find((item) => item.path === currentPath);

  return (
    <main className="admin-shell">
      {sidebarOpen && (
        <button
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Đóng menu"
        />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a
          href="/admin"
          className="admin-brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("/admin");
          }}
        >
          <span className="admin-brand-mark">Q</span>
          <span>
            <strong>QMDATN2026</strong>
            <small>SPORT RETAIL ADMIN</small>
          </span>
        </a>

        <div className="admin-sidebar-body">
          {navigation.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <p className="admin-nav-label">{group.label}</p>

              {group.items.map((item) => (
                <button
                  key={item.path}
                  className={`admin-nav-item ${currentPath === item.path ? "active" : ""
                    }`}
                  disabled={item.disabled}
                  onClick={() => navigate(item.path)}
                  title={item.disabled ? "Chưa triển khai" : item.title}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  <span>{item.title}</span>
                  {item.disabled && (
                    <span className="admin-nav-soon">Sắp có</span>
                  )}
                </button>
              ))}
            </section>
          ))}
        </div>

        <div className="admin-sidebar-bottom">
          <div className="admin-profile">
            <div className="admin-avatar">
              {(user?.fullName || "A").charAt(0).toUpperCase()}
            </div>
            <div className="admin-profile-info">
              <strong>{user?.fullName || "Quản trị viên"}</strong>
              <small>Administrator</small>
            </div>
          </div>

          <button
            className="admin-logout"
            onClick={onLogout}
            disabled={logoutLoading}
          >
            <span>↪</span>
            {logoutLoading ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <button
              className="admin-menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mở menu"
            >
              ☰
            </button>

            <div>
              <span className="admin-breadcrumb">
                QUẢN TRỊ / QMDATN2026
              </span>
              <h1>{currentItem?.title || "Dashboard"}</h1>
            </div>
          </div>

          <div className="admin-header-right">
            <span className="admin-online-dot" />
            <span>Hệ thống hoạt động</span>
          </div>
        </header>

        <div className="admin-page-content">
          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              {error}
            </div>
          )}

          {currentPath === "/admin" ? (
            <section className="admin-welcome">
              <span className="admin-eyebrow">WORKSPACE OVERVIEW</span>
              <h2>Xin chào, {user?.fullName || "Quản trị viên"}.</h2>
              <p>Chào mừng bạn đến với hệ thống quản lý cửa hàng.</p>

              <div className="admin-overview-grid">
                <article className="admin-overview-card admin-overview-primary">
                  <span>CATALOG MANAGEMENT</span>
                  <h3>Quản lý danh mục sản phẩm</h3>
                  <p>Tổ chức danh mục và thương hiệu cho cửa hàng.</p>
                  <button onClick={() => navigate("/admin/categories")}>
                    Quản lý danh mục <span>↗</span>
                  </button>
                </article>

                <article className="admin-overview-card">
                  <span>BRAND MANAGEMENT</span>
                  <h3>Thương hiệu</h3>
                  <p>Quản lý các thương hiệu kinh doanh.</p>
                  <button onClick={() => navigate("/admin/brands")}>
                    Quản lý thương hiệu <span>↗</span>
                  </button>
                </article>
              </div>
            </section>
          ) : currentPath === "/admin/categories" ? (
            <CatalogManagementPage
              key="categories"
              type="categories"
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/brands" ? (
            <CatalogManagementPage
              key="brands"
              type="brands"
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/products" ? (
            <ProductManagementPage
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/inventory" ? (
            <InventoryManagementPage
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/orders" ? (
            <OrderManagementPage
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/vouchers" ? (
            <VoucherManagementPage
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : currentPath === "/admin/members" ? (
            <MemberManagementPage
              accessToken={accessToken}
              onSessionUpdate={onSessionUpdate}
              onSessionExpired={onLogout}
            />
          ) : (
            <section className="admin-coming-soon">
              <span>COMING SOON</span>
              <h2>{currentItem?.title || "Trang quản lý"}</h2>
              <p>Giao diện quản lý đang được triển khai.</p>
            </section>
          )}
        </div>

        <footer className="admin-footer">
          <span>© 2026 QMDATN2026</span>
          <span>SPORT RETAIL MANAGEMENT SYSTEM</span>
        </footer>
      </section>
    </main>
  );
}
