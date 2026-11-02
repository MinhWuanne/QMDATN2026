import { useEffect, useState } from "react";
import "./styles/customer.css";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import VerifyEmail from "./pages/auth/VerifyEmail.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Dashboard from "./pages/auth/Dashboard.jsx";
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

function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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
    if (logoutLoading) return;

    setLogoutError("");
    setLogoutLoading(true);

    try {
      await apiRequest("/logout", { method: "POST" });
      setSession(null);
      window.location.href = "/login";
    } catch (err) {
      setLogoutError(
        err.message || "Đăng xuất không thành công. Vui lòng thử lại."
      );
    } finally {
      setLogoutLoading(false);
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
    return (
      <Dashboard
        user={session.user}
        onLogout={handleLogout}
        logoutLoading={logoutLoading}
        logoutError={logoutError}
      />
    );
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
