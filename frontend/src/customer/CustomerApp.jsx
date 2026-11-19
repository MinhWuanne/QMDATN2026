
import { useCallback, useEffect, useState } from "react";
import "./styles/customer.css";

import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import VerifyEmail from "./pages/auth/VerifyEmail.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Dashboard from "./pages/auth/Dashboard.jsx";
import StorefrontPage from "./pages/storefront/StorefrontPage.jsx";
import CustomerSupportWidget from "./components/support/CustomerSupportWidget.jsx";

import { apiRequest } from "./services/auth.service.js";

let customerRefreshPromise = null;

function refreshCustomerSession() {
  if (!customerRefreshPromise) {
    customerRefreshPromise = apiRequest("/refresh", {
      method: "POST",
    }).finally(() => {
      customerRefreshPromise = null;
    });
  }

  return customerRefreshPromise;
}

function CustomerApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [path, setPath] = useState(
    window.location.pathname.replace(/\/+$/, "") || "/"
  );
  const [cartCount, setCartCount] = useState(0);
  const [supportOpen, setSupportOpen] = useState(false);

  // Đồng bộ đường dẫn khi người dùng bấm Back / Forward.
  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname.replace(/\/+$/, "") || "/");
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Điều hướng nội bộ mà không tải lại toàn bộ trang.
  const navigate = useCallback((nextPath) => {
    const normalizedPath = nextPath.replace(/\/+$/, "") || "/";

    if (window.location.pathname !== normalizedPath) {
      window.history.pushState({}, "", normalizedPath);
    }

    setPath(normalizedPath);
  }, []);

  // Kiểm tra phiên đăng nhập khi mở ứng dụng.
  useEffect(() => {
    let active = true;

    refreshCustomerSession()
      .then((data) => {
        if (
          !data.tokens?.accessToken ||
          !data.user ||
          data.user.role !== "CUSTOMER"
        ) {
          throw new Error("Phiên khách hàng không hợp lệ.");
        }

        if (active) {
          setSession({
            accessToken: data.tokens.accessToken,
            user: data.user,
          });
        }
      })
      .catch(() => {
        // Chưa đăng nhập hoặc phiên đã hết hạn.
      })
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSessionRefresh = useCallback(async () => {
    const data = await refreshCustomerSession();

    if (
      !data.tokens?.accessToken ||
      !data.user ||
      data.user.role !== "CUSTOMER"
    ) {
      throw new Error("Phiên khách hàng không hợp lệ.");
    }

    const nextSession = {
      accessToken: data.tokens.accessToken,
      user: data.user,
    };

    setSession(nextSession);
    return nextSession;
  }, []);

  const handleSessionExpired = useCallback(() => {
    setSupportOpen(false);
    setSession(null);
    navigate("/login");
  }, [navigate]);

  async function handleLogout() {
    if (logoutLoading) return;

    setLogoutError("");
    setLogoutLoading(true);

    try {
      await apiRequest("/logout", { method: "POST" });
      setSupportOpen(false);
      setSession(null);
      navigate("/login");
    } catch (err) {
      setLogoutError(
        err.message || "Đăng xuất không thành công. Vui lòng thử lại."
      );
    } finally {
      setLogoutLoading(false);
    }
  }

  // Guest không được truy cập khu vực tài khoản.
  useEffect(() => {
    if (!checkingSession && !session && path.startsWith("/account")) {
      navigate("/login");
    }
  }, [checkingSession, session, path, navigate]);

  // Customer không cần quay lại các trang xác thực.
  useEffect(() => {
    if (
      !checkingSession &&
      session &&
      ["/login", "/register"].includes(path)
    ) {
      navigate("/");
    }
  }, [checkingSession, session, path, navigate]);

  if (checkingSession) {
    return (
      <main className="auth-loading">
        <span className="auth-brand-mark">Q</span>
        <p>Đang kiểm tra phiên đăng nhập...</p>
      </main>
    );
  }

  // Các trang xác thực dành cho Guest.
  if (!session) {
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
        return (
          <Login
            onLogin={(data) => {
              if (
                !data.tokens?.accessToken ||
                !data.user ||
                data.user.role !== "CUSTOMER"
              ) {
                return;
              }

              setSession({
                accessToken: data.tokens.accessToken,
                user: data.user,
              });

              navigate("/");
            }}
          />
        );

      default:
        return (
          <StorefrontPage
            user={null}
            cartCount={cartCount}
            onNavigate={navigate}
            onRequireLogin={() => navigate("/login")}
            onAddToCart={() => setCartCount((count) => count + 1)}
          />
        );
    }
  }

  // Nội dung trang Customer.
  const customerPage = path.startsWith("/account") ? (
    <Dashboard
      user={session.user}
      accessToken={session.accessToken}
      onSessionRefresh={handleSessionRefresh}
      onSessionExpired={handleSessionExpired}
      onLogout={handleLogout}
      logoutLoading={logoutLoading}
      logoutError={logoutError}
    />
  ) : (
    <StorefrontPage
      user={session.user}
      cartCount={cartCount}
      onNavigate={navigate}
      onRequireLogin={() => navigate("/login")}
      onAddToCart={() => setCartCount((count) => count + 1)}
      onOpenSupport={() => setSupportOpen(true)}
    />
  );

  // Widget được đặt ngoài nội dung từng trang để không bị khởi tạo lại
  // khi Customer chuyển giữa Storefront và Dashboard.
  return (
    <>
      {customerPage}

      <CustomerSupportWidget
        user={session.user}
        accessToken={session.accessToken}
        onSessionRefresh={handleSessionRefresh}
        onSessionExpired={handleSessionExpired}
        isOpen={supportOpen}
        onOpenChange={setSupportOpen}
      />
    </>
  );
}

export default CustomerApp;
