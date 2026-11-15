
import { useMemo, useState } from "react";
import "./storefront.css";

const products = [
  {
    id: "SP001",
    name: "Vợt cầu lông Yonex Astrox 99 Pro",
    brand: "YONEX",
    category: "Vợt cầu lông",
    price: 3890000,
    oldPrice: 4290000,
    rating: 4.9,
    reviews: 128,
    badge: "BÁN CHẠY",
    icon: "🏸",
    tone: "lime",
  },
  {
    id: "SP002",
    name: "Vợt cầu lông Victor Thruster K",
    brand: "VICTOR",
    category: "Vợt cầu lông",
    price: 2650000,
    oldPrice: 2990000,
    rating: 4.8,
    reviews: 86,
    badge: "GIẢM GIÁ",
    icon: "🏸",
    tone: "blue",
  },
  {
    id: "SP003",
    name: "Giày cầu lông Yonex Power Cushion",
    brand: "YONEX",
    category: "Giày cầu lông",
    price: 1890000,
    oldPrice: 2190000,
    rating: 4.9,
    reviews: 74,
    badge: "NỔI BẬT",
    icon: "👟",
    tone: "orange",
  },
  {
    id: "SP004",
    name: "Áo thể thao QMD Performance",
    brand: "QMD SPORT",
    category: "Quần áo",
    price: 350000,
    oldPrice: null,
    rating: 4.7,
    reviews: 42,
    badge: "",
    icon: "👕",
    tone: "purple",
  },
  {
    id: "SP005",
    name: "Balo thể thao Yonex Pro Series",
    brand: "YONEX",
    category: "Phụ kiện",
    price: 1250000,
    oldPrice: 1450000,
    rating: 4.8,
    reviews: 53,
    badge: "",
    icon: "🎒",
    tone: "pink",
  },
  {
    id: "SP006",
    name: "Ống cầu lông Yonex AS-30",
    brand: "YONEX",
    category: "Phụ kiện",
    price: 720000,
    oldPrice: null,
    rating: 4.9,
    reviews: 102,
    badge: "PHỔ BIẾN",
    icon: "🏸",
    tone: "cyan",
  },
];

const categories = [
  { name: "Tất cả", icon: "✦" },
  { name: "Vợt cầu lông", icon: "🏸" },
  { name: "Giày cầu lông", icon: "👟" },
  { name: "Quần áo", icon: "👕" },
  { name: "Phụ kiện", icon: "🎒" },
];

const formatPrice = (value) =>
  new Intl.NumberFormat("vi-VN").format(value) + "₫";

export default function StorefrontPage({
  user,
  cartCount = 0,
  onNavigate,
  onRequireLogin,
  onAddToCart,
}) {
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: "admin",
      content:
        "Xin chào! QMD Sport có thể hỗ trợ bạn về sản phẩm, đơn hàng và các vấn đề khác. Bạn cần giúp gì?",
      time: "09:00",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "Tất cả" ||
        product.category === activeCategory;

      const matchesSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.brand.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  function handleProductClick(product) {
    onNavigate?.(`/products/${product.id}`);
  }

  function handleAddToCart(product) {
    onAddToCart?.(product);
  }

  function handleChatClick() {
    if (!user) {
      onRequireLogin?.();
      return;
    }

    setChatOpen((current) => !current);
  }

  function handleSendChat(event) {
    event.preventDefault();

    const message = chatInput.trim();
    if (!message) return;

    const newMessage = {
      id: Date.now(),
      sender: "customer",
      content: message,
      time: new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    };

    setChatMessages((current) => [...current, newMessage]);
    setChatInput("");
  }

  return (
    <div className="storefront">
      <div className="store-announcement">
        <span>✦</span>
        MIỄN PHÍ VẬN CHUYỂN CHO ĐƠN HÀNG TỪ 1.000.000₫
        <span className="store-announcement-separator">·</span>
        ƯU ĐÃI ĐẶC BIỆT TẠI QMD SPORT
      </div>

      <header className="store-header">
        <a
          href="/"
          className="store-logo"
          onClick={(event) => {
            event.preventDefault();
            onNavigate?.("/");
          }}
        >
          <span className="store-logo-mark">Q</span>
          <span className="store-logo-text">
            QMD SPORT
            <small>PLAY YOUR GAME</small>
          </span>
        </a>

        <nav className="store-main-nav">
          <button
            className="active"
            onClick={() => onNavigate?.("/")}
          >
            Trang chủ
          </button>
          <button onClick={() => onNavigate?.("/products")}>
            Sản phẩm
          </button>
          <button onClick={() => onNavigate?.("/products?category=Vợt cầu lông")}>
            Vợt cầu lông
          </button>
          <button onClick={() => onNavigate?.("/products?category=Giày cầu lông")}>
            Giày thể thao
          </button>
          <button onClick={() => onNavigate?.("/products?category=Phụ kiện")}>
            Phụ kiện
          </button>
        </nav>

        <div className="store-header-actions">
          <button
            className="store-icon-button"
            title="Tìm kiếm"
            onClick={() => {
              document
                .querySelector(".store-search-input")
                ?.focus();
            }}
          >
            ⌕
          </button>

          <button
            className="store-icon-button store-cart-button"
            title="Giỏ hàng"
            onClick={() => onNavigate?.("/cart")}
          >
            ♧
            <span>Giỏ hàng</span>
            {cartCount > 0 && (
              <b className="store-cart-count">{cartCount}</b>
            )}
          </button>

          {user ? (
            <button
              className="store-account-button"
              onClick={() => onNavigate?.("/account")}
            >
              <span className="store-account-avatar">
                {(user.fullName || "U").charAt(0).toUpperCase()}
              </span>
              <span>Tài khoản</span>
            </button>
          ) : (
            <button
              className="store-login-button"
              onClick={onRequireLogin}
            >
              Đăng nhập <span>↗</span>
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="store-hero">
          <div className="store-hero-content">
            <span className="store-eyebrow">
              <span /> QMD SPORT COLLECTION 2026
            </span>

            <h1>
              FIND YOUR
              <br />
              <span>PERFECT</span>
              <br />
              GAME.
            </h1>

            <p>
              Khám phá thế giới cầu lông cùng những sản phẩm
              chất lượng dành cho hành trình chinh phục của bạn.
            </p>

            <div className="store-hero-actions">
              <button
                className="store-primary-button"
                onClick={() => onNavigate?.("/products")}
              >
                KHÁM PHÁ SẢN PHẨM <span>↗</span>
              </button>
              <button
                className="store-secondary-button"
                onClick={() => onNavigate?.("/products?category=Vợt cầu lông")}
              >
                Xem bộ sưu tập
              </button>
            </div>

            <div className="store-hero-stats">
              <div>
                <strong>100+</strong>
                <span>Sản phẩm</span>
              </div>
              <div>
                <strong>4.9/5</strong>
                <span>Đánh giá</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>Hỗ trợ</span>
              </div>
            </div>
          </div>

          <div className="store-hero-visual">
            <div className="store-hero-circle" />
            <div className="store-hero-decoration">QMD</div>
            <div className="store-hero-product">
              <span>🏸</span>
            </div>
            <div className="store-hero-label">
              <small>FEATURED COLLECTION</small>
              <strong>POWER YOUR GAME</strong>
              <span>2026 / PERFORMANCE SERIES</span>
            </div>
            <div className="store-hero-floating-tag">
              <span>✦</span>
              PERFORMANCE
            </div>
          </div>
        </section>

        <section className="store-benefits">
          <article>
            <span>🚚</span>
            <div>
              <strong>Giao hàng toàn quốc</strong>
              <small>Nhanh chóng và tiện lợi</small>
            </div>
          </article>
          <article>
            <span>✓</span>
            <div>
              <strong>Sản phẩm chính hãng</strong>
              <small>Chất lượng được ưu tiên</small>
            </div>
          </article>
          <article>
            <span>↻</span>
            <div>
              <strong>Hỗ trợ đổi trả</strong>
              <small>Chính sách minh bạch</small>
            </div>
          </article>
          <article>
            <span>♡</span>
            <div>
              <strong>Chăm sóc khách hàng</strong>
              <small>Luôn sẵn sàng hỗ trợ</small>
            </div>
          </article>
        </section>

        <section className="store-categories-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">SHOP BY CATEGORY</span>
              <h2>Danh mục sản phẩm</h2>
              <p>Tìm kiếm trang bị phù hợp với phong cách chơi của bạn.</p>
            </div>
            <button
              className="store-text-link"
              onClick={() => onNavigate?.("/products")}
            >
              Tất cả sản phẩm ↗
            </button>
          </div>

          <div className="store-category-grid">
            {categories.slice(1).map((category, index) => (
              <button
                key={category.name}
                className={`store-category-card category-${index + 1}`}
                onClick={() => {
                  setActiveCategory(category.name);
                  document
                    .querySelector(".store-products-section")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="store-category-icon">{category.icon}</span>
                <span className="store-category-name">{category.name}</span>
                <span className="store-category-arrow">↗</span>
              </button>
            ))}
          </div>
        </section>

        <section className="store-products-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">OUR SELECTION</span>
              <h2>Sản phẩm nổi bật</h2>
              <p>Những lựa chọn được yêu thích tại QMD Sport.</p>
            </div>
            <button
              className="store-text-link"
              onClick={() => onNavigate?.("/products")}
            >
              Xem tất cả ↗
            </button>
          </div>

          <div className="store-product-toolbar">
            <div className="store-category-filters">
              {categories.map((category) => (
                <button
                  key={category.name}
                  className={
                    activeCategory === category.name ? "active" : ""
                  }
                  onClick={() => setActiveCategory(category.name)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <label className="store-search">
              <span>⌕</span>
              <input
                className="store-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm sản phẩm..."
              />
            </label>
          </div>

          <div className="store-product-grid">
            {filteredProducts.map((product) => (
              <article className="store-product-card" key={product.id}>
                <button
                  className="store-product-visual-button"
                  onClick={() => handleProductClick(product)}
                  aria-label={`Xem ${product.name}`}
                >
                  <div className={`store-product-visual ${product.tone}`}>
                    {product.badge && (
                      <span className="store-product-badge">
                        {product.badge}
                      </span>
                    )}
                    <span className="store-product-art">
                      {product.icon}
                    </span>
                    <span className="store-product-art-label">
                      {product.brand}
                    </span>
                  </div>
                </button>

                <div className="store-product-info">
                  <span className="store-product-brand">
                    {product.brand}
                  </span>
                  <button
                    className="store-product-name"
                    onClick={() => handleProductClick(product)}
                  >
                    {product.name}
                  </button>

                  <div className="store-product-rating">
                    <span>★</span>
                    {product.rating}
                    <small>({product.reviews} đánh giá)</small>
                  </div>

                  <div className="store-product-price">
                    <strong>{formatPrice(product.price)}</strong>
                    {product.oldPrice && (
                      <del>{formatPrice(product.oldPrice)}</del>
                    )}
                  </div>

                  <button
                    className="store-add-cart-button"
                    onClick={() => handleAddToCart(product)}
                  >
                    + THÊM VÀO GIỎ
                  </button>
                </div>
              </article>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="store-no-products">
              <span>⌕</span>
              <h3>Không tìm thấy sản phẩm</h3>
              <p>Hãy thử một từ khóa hoặc danh mục khác.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setActiveCategory("Tất cả");
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </section>

        <section className="store-promo-banner">
          <div>
            <span>QMD SPORT MEMBERSHIP</span>
            <h2>Chơi hết mình. Nhận nhiều ưu đãi.</h2>
            <p>
              Trở thành thành viên để theo dõi đơn hàng và nhận
              những ưu đãi dành riêng cho bạn.
            </p>
            <button
              onClick={() =>
                user
                  ? onNavigate?.("/account")
                  : onRequireLogin?.()
              }
            >
              {user ? "TÀI KHOẢN CỦA TÔI" : "THAM GIA NGAY"} ↗
            </button>
          </div>
          <div className="store-promo-decoration">Q</div>
        </section>
      </main>

      <footer className="store-footer">
        <div className="store-footer-main">
          <div className="store-footer-brand">
            <a href="/" onClick={(event) => {
              event.preventDefault();
              onNavigate?.("/");
            }}>
              <span className="store-logo-mark">Q</span>
              <strong>QMD SPORT</strong>
            </a>
            <p>
              Đồng hành cùng đam mê thể thao.
              Trang bị tốt hơn, trải nghiệm tốt hơn.
            </p>
          </div>

          <div>
            <strong>Khám phá</strong>
            <button onClick={() => onNavigate?.("/products")}>
              Sản phẩm
            </button>
            <button onClick={() => onNavigate?.("/cart")}>
              Giỏ hàng
            </button>
          </div>

          <div>
            <strong>Khách hàng</strong>
            <button onClick={() => onNavigate?.("/account/orders")}>
              Đơn hàng của tôi
            </button>
            <button onClick={() => onNavigate?.("/account/profile")}>
              Tài khoản
            </button>
          </div>

          <div>
            <strong>Hỗ trợ</strong>
            <button onClick={handleChatClick}>
              Chat với chúng tôi
            </button>
            <span>Hỗ trợ khách hàng</span>
          </div>
        </div>

        <div className="store-footer-bottom">
          <span>© 2026 QMD SPORT. ALL RIGHTS RESERVED.</span>
          <span>PLAY YOUR GAME.</span>
        </div>
      </footer>

      <button
        className={`store-chat-fab ${chatOpen ? "active" : ""}`}
        onClick={handleChatClick}
        aria-label="Chat hỗ trợ khách hàng"
        title="Chat hỗ trợ"
      >
        {chatOpen ? "×" : "✉"}
        {!chatOpen && <span>Hỗ trợ</span>}
      </button>

      {chatOpen && (
        <section className="store-chat-panel">
          <header className="store-chat-panel-header">
            <div className="store-chat-panel-avatar">Q</div>
            <div>
              <strong>QMD SPORT SUPPORT</strong>
              <small><span /> Đội ngũ hỗ trợ</small>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              aria-label="Đóng chat"
            >
              ×
            </button>
          </header>

          <div className="store-chat-panel-messages">
            <div className="store-chat-date">HỘI THOẠI HỖ TRỢ</div>

            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`store-chat-message ${
                  message.sender === "customer" ? "mine" : "theirs"
                }`}
              >
                <p>{message.content}</p>
                <time>{message.time}</time>
              </div>
            ))}
          </div>

          <form
            className="store-chat-panel-compose"
            onSubmit={handleSendChat}
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Nhập tin nhắn..."
              maxLength={2000}
            />
            <button type="submit" disabled={!chatInput.trim()}>
              ↗
            </button>
          </form>

          <div className="store-chat-demo-note">
            Giao diện mô phỏng — chưa kết nối hệ thống hỗ trợ.
          </div>
        </section>
      )}
    </div>
  );
}
