import { useEffect, useState } from "react";
import AdminLogin from "./pages/auth/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import { adminAuthRequest } from "./services/admin-auth.service.js";
import "./styles/admin.css";

let adminRefreshPromise = null;

function refreshAdminSession() {
  if (!adminRefreshPromise) {
    adminRefreshPromise = adminAuthRequest("/refresh", {
      method: "POST",
    }).finally(() => {
      adminRefreshPromise = null;
    });
  }

  return adminRefreshPromise;
}

export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    refreshAdminSession()
      .then((data) => {
        if (
          !data.user ||
          data.user.role !== "ADMIN" ||
          !data.tokens?.accessToken
        ) {
          throw new Error("Phiên quản trị không hợp lệ.");
        }

        if (active) {
          setSession({
            user: data.user,
            accessToken: data.tokens.accessToken,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function handleSessionUpdate(data) {
    setSession({
      user: data.user,
      accessToken: data.accessToken,
    });
  }

  function handleLogin(data) {
    setSession({
      user: data.user,
      accessToken: data.tokens.accessToken,
    });
  }

  async function handleLogout() {
    if (logoutLoading) return;

    setError("");
    setLogoutLoading(true);

    try {
      await adminAuthRequest("/logout", { method: "POST" });
      setSession(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoutLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="admin-auth-loading">
        <span>Q</span>
        <p>Đang kiểm tra phiên quản trị...</p>
      </main>
    );
  }

  if (!session) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <AdminDashboard
      user={session.user}
      accessToken={session.accessToken}
      onSessionUpdate={handleSessionUpdate}
      onLogout={handleLogout}
      logoutLoading={logoutLoading}
      error={error}
    />
  );
}