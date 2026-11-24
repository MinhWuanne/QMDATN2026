
import { useCallback, useEffect, useState } from "react";

import "./styles/customer.css";

import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import VerifyEmail from "./pages/auth/VerifyEmail.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Dashboard from "./pages/auth/Dashboard.jsx";
import StorefrontPage from "./pages/storefront/StorefrontPage.jsx";
import CartPage from "./pages/storefront/CartPage.jsx";
import ProductDetailPage from "./pages/storefront/ProductDetailPage.jsx";
import CheckoutPage from "./pages/storefront/CheckoutPage.jsx";
import CustomerSupportWidget from "./components/support/CustomerSupportWidget.jsx";

import { apiRequest } from "./services/auth.service.js";
import { getCustomerCart } from "./services/cart.service.js";

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

function LoginRequiredDialog({ onLogin, onClose }) {
  return (
    <div
      className="customer-login-prompt-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="customer-login-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-login-prompt-title"
      >
        <button
          type="button"
          className="customer-login-prompt-close"
          onClick={onClose}
          aria-label="Đóng thông báo"
        >
          ×
        </button>

        <div className="customer-login-prompt-icon">Q</div>

        <h2 id="customer-login-prompt-title">
          Đăng nhập để tiếp tục
        </h2>

        <p>
          Vui lòng đăng nhập tài khoản Lan Anh Sport để sử dụng giỏ hàng và
          tiếp tục mua sắm.
        </p>

        <div className="customer-login-prompt-actions">
          <button
            type="button"
            className="customer-login-prompt-primary"
            onClick={onLogin}
          >
            ĐĂNG NHẬP
          </button>

          <button
            type="button"
            className="customer-login-prompt-secondary"
            onClick={onClose}
          >
            ĐỂ SAU
          </button>
        </div>
      </section>
    </div>
  );
}

function CustomerApp() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [path, setPath] = useState(
    window.location.pathname.replace(/\/+$/, "") || "/"
  );

  const [cart, setCart] = useState(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");

  // Lưu CartItem ID được chọn khi chuyển từ Cart sang Checkout.
  const [checkoutCartItemIds, setCheckoutCartItemIds] = useState([]);

  // Lưu thông tin sản phẩm được chọn khi chuyển từ Product Detail sang Checkout.
  const [checkoutBuyNow, setCheckoutBuyNow] = useState(null);

  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const cartCount = cart?.totalQuantity || 0;

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
    setCart(null);
    setCartError("");
    setCartLoading(false);
    setCheckoutCartItemIds([]);
    setLoginPromptOpen(false);

    navigate("/login");
  }, [navigate]);

  // Tải giỏ hàng, tự refresh access token nếu token hiện tại hết hạn.
  const loadCustomerCart = useCallback(async () => {
    if (!session?.accessToken) {
      return null;
    }

    try {
      let result;

      try {
        result = await getCustomerCart(session.accessToken);
      } catch (error) {
        if (error.status !== 401) {
          throw error;
        }

        const nextSession = await handleSessionRefresh();

        result = await getCustomerCart(nextSession.accessToken);
      }

      setCart(result || null);
      setCartError("");

      return result || null;
    } catch (error) {
      if (error.status === 401) {
        handleSessionExpired();
        return null;
      }

      setCartError(
        error.message || "Không thể tải giỏ hàng."
      );

      throw error;
    }
  }, [
    session?.accessToken,
    handleSessionRefresh,
    handleSessionExpired,
  ]);

  // Tải giỏ hàng từ database sau khi Customer có phiên hợp lệ.
  useEffect(() => {
    if (!session?.accessToken) {
      setCart(null);
      setCartError("");
      setCartLoading(false);
      return;
    }

    let active = true;

    async function loadCart() {
      setCartLoading(true);
      setCartError("");

      try {
        const result = await loadCustomerCart();

        if (active) {
          setCart(result || null);
        }
      } catch {
        // loadCustomerCart đã cập nhật cartError.
      } finally {
        if (active) {
          setCartLoading(false);
        }
      }
    }

    loadCart();

    return () => {
      active = false;
    };
  }, [session?.accessToken, loadCustomerCart]);

  // Đồng bộ giỏ hàng sau Add to Cart, xóa hoặc cập nhật số lượng.
  const handleCartChange = useCallback(async () => {
    if (!session?.accessToken) {
      return;
    }

    setCartLoading(true);

    try {
      await loadCustomerCart();
    } catch {
      // Lỗi đã được hiển thị qua cartError.
    } finally {
      setCartLoading(false);
    }
  }, [session?.accessToken, loadCustomerCart]);

  // Nhận danh sách CartItem ID từ CartPage và chuyển sang Checkout.
  const handleCheckout = useCallback(
    (cartItemIds) => {
      if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
        return;
      }

      const validCartItemIds = [
        ...new Set(
          cartItemIds.filter(
            (id) => typeof id === "string" && id.trim().length > 0
          )
        ),
      ];

      if (validCartItemIds.length === 0) {
        return;
      }

      setCheckoutBuyNow(null);
      setCheckoutCartItemIds(validCartItemIds);
      navigate("/checkout");
    },
    [navigate]
  );

  const handleBuyNow = useCallback(
    (item) => {
      if (
        !item ||
        typeof item.variantId !== "string" ||
        !item.variantId.trim() ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return;
      }

      setCheckoutCartItemIds([]);
      setCheckoutBuyNow(item);
      navigate("/checkout");
    },
    [navigate]
  );

  // Guest không được truy cập khu vực tài khoản và đơn hàng.
  useEffect(() => {
    const isProtectedPath =
      path.startsWith("/account") ||
      path === "/orders" ||
      path.startsWith("/orders/");

    if (!checkingSession && !session && isProtectedPath) {
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

  // Chuyển đường dẫn đơn hàng cũ sang trang Orders mới.
  useEffect(() => {
    if (
      !checkingSession &&
      session &&
      path === "/account/orders"
    ) {
      navigate("/orders");
    }
  }, [checkingSession, session, path, navigate]);

  // Guest mở trực tiếp Cart hoặc Checkout phải đăng nhập.
  useEffect(() => {
    if (
      !checkingSession &&
      !session &&
      ["/cart", "/checkout"].includes(path)
    ) {
      setLoginPromptOpen(true);
    } else {
      setLoginPromptOpen(false);
    }
  }, [checkingSession, session, path]);

  function handleRequireLogin() {
    setLoginPromptOpen(true);
  }

  function handleLoginFromPrompt() {
    setLoginPromptOpen(false);
    navigate("/login");
  }

  async function handleLogout() {
    if (logoutLoading) {
      return;
    }

    setLogoutError("");
    setLogoutLoading(true);

    try {
      await apiRequest("/logout", { method: "POST" });

      setSupportOpen(false);
      setSession(null);
      setCart(null);
      setCartError("");
      setCheckoutCartItemIds([]);
      setLoginPromptOpen(false);

      navigate("/login");
    } catch (error) {
      setLogoutError(
        error.message || "Đăng xuất không thành công. Vui lòng thử lại."
      );
    } finally {
      setLogoutLoading(false);
    }
  }

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

              setCart(null);
              setCartError("");
              setCheckoutCartItemIds([]);

              setSession({
                accessToken: data.tokens.accessToken,
                user: data.user,
              });

              setLoginPromptOpen(false);
              navigate("/");
            }}
          />
        );

      default: {
        const productDetailMatch = path.match(/^\/products\/([^/]+)$/);

        const guestPage = productDetailMatch ? (
          <ProductDetailPage
            productId={decodeURIComponent(productDetailMatch[1])}
            user={null}
            accessToken={null}
            onNavigate={navigate}
            onRequireLogin={handleRequireLogin}
          />
        ) : (
          <StorefrontPage
            user={null}
            cartCount={0}
            onNavigate={navigate}
            onRequireLogin={handleRequireLogin}
            onAddToCart={handleRequireLogin}
          />
        );

        return (
          <>
            {guestPage}

            {loginPromptOpen && (
              <LoginRequiredDialog
                onLogin={handleLoginFromPrompt}
                onClose={() => setLoginPromptOpen(false)}
              />
            )}
          </>
        );
      }
    }
  }

  // Nhận diện các đường dẫn trang Customer.
  const productDetailMatch = path.match(/^\/products\/([^/]+)$/);
  const orderDetailMatch = path.match(/^\/orders\/([^/]+)$/);

  const isOrderPath =
    path === "/orders" || path.startsWith("/orders/");

  // Nội dung trang Customer.
  // Orders và Account cùng sử dụng Dashboard làm bố cục chung.
  const customerPage =
    isOrderPath || path.startsWith("/account") ? (
      <Dashboard
        user={session.user}
        accessToken={session.accessToken}
        onSessionRefresh={handleSessionRefresh}
        onSessionExpired={handleSessionExpired}
        onLogout={handleLogout}
        logoutLoading={logoutLoading}
        logoutError={logoutError}
        onNavigate={navigate}
        path={path}
        orderId={
          orderDetailMatch
            ? decodeURIComponent(orderDetailMatch[1])
            : null
        }
      />
    ) : productDetailMatch ? (
      <ProductDetailPage
        productId={decodeURIComponent(productDetailMatch[1])}
        user={session.user}
        accessToken={session.accessToken}
        onNavigate={navigate}
        onRequireLogin={handleRequireLogin}
        onSessionRefresh={handleSessionRefresh}
        onSessionExpired={handleSessionExpired}
        onCartChange={handleCartChange}
        onBuyNow={handleBuyNow}
        onOpenSupport={() => setSupportOpen(true)}
      />
    ) : path === "/cart" ? (
      <CartPage
        accessToken={session.accessToken}
        onNavigate={navigate}
        onSessionRefresh={handleSessionRefresh}
        onSessionExpired={handleSessionExpired}
        onCartChange={setCart}
        onCheckout={handleCheckout}
      />
    ) : path === "/checkout" ? (
      <CheckoutPage
        accessToken={session.accessToken}
        selectedCartItemIds={checkoutCartItemIds}
        buyNowItem={checkoutBuyNow}
        onNavigate={navigate}
        onSessionRefresh={handleSessionRefresh}
        onSessionExpired={handleSessionExpired}
        onCartChange={setCart}
        onOrderCreated={() => {
          setCheckoutCartItemIds([]);
          setCheckoutBuyNow(null);
        }}
      />
    ) : (
      <StorefrontPage
        user={session.user}
        cartCount={cartCount}
        cartLoading={cartLoading}
        cartError={cartError}
        onNavigate={navigate}
        onRequireLogin={handleRequireLogin}
        onAddToCart={(product) => {
          if (product?.id) {
            navigate(`/products/${product.id}`);
          }
        }}
        onOpenSupport={() => setSupportOpen(true)}
      />
    );

  // Widget đặt ngoài nội dung từng trang để không khởi tạo lại khi chuyển trang.
  return (
    <>
      {customerPage}

      {loginPromptOpen && (
        <LoginRequiredDialog
          onLogin={handleLoginFromPrompt}
          onClose={() => setLoginPromptOpen(false)}
        />
      )}

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
