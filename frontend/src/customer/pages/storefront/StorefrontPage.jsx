import { useEffect, useMemo, useState } from "react";
import "./storefront.css";

import {
  getCustomerCatalogProducts,
  getCustomerCatalogCategories,
} from "../../services/catalog.service";

const ALL_CATEGORY = { id: null, name: "Tất cả", icon: "✦" };

function getCategoryIcon(name = "") {
  const value = name.toLowerCase();
  if (value.includes("vợt") || value.includes("cầu")) return "🏸";
  if (value.includes("giày")) return "👟";
  if (value.includes("áo") || value.includes("quần") || value.includes("trang phục")) return "👕";
  if (value.includes("phụ kiện")) return "🎒";
  return "✦";
}

function getProductImage(product) {
  const productImages = Array.isArray(product.images) ? product.images : [];
  const variantImages = (product.variants || []).flatMap(
    (variant) => variant.images || []
  );
  const images = [...productImages, ...variantImages];
  return images.find((image) => image.isPrimary)?.imageUrl || images[0]?.imageUrl || "";
}

function mapCatalogProduct(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    ...product,
    brandName: product.brand?.name || "QMD SPORT",
    categoryName: product.category?.name || "Khác",
    imageUrl: getProductImage(product),
    inStock: variants.some((variant) => variant.inStock),
    tone: "lime",
    icon: getCategoryIcon(product.category?.name),
  };
}

const formatPrice = (value) =>
  new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "₫";

export default function StorefrontPage({
  user,
  cartCount = 0,
  onNavigate,
  onRequireLogin,
  onAddToCart,
  onOpenSupport,
}) {
  const [activeCategory, setActiveCategory] = useState("Tất cả");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([ALL_CATEGORY]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError("");

      try {
        const [productsResult, categoriesResult] = await Promise.all([
          getCustomerCatalogProducts({
            page: 1,
            limit: 50,
            sortBy: "createdAt",
            sortOrder: "desc",
          }),
          getCustomerCatalogCategories(),
        ]);

        if (cancelled) return;

        const productItems = Array.isArray(productsResult?.data)
          ? productsResult.data
          : [];
        const categoryItems = Array.isArray(categoriesResult?.data)
          ? categoriesResult.data
          : [];

        setProducts(productItems.map(mapCatalogProduct));
        setCategories([
          ALL_CATEGORY,
          ...categoryItems.map((category) => ({
            ...category,
            icon: getCategoryIcon(category.name),
          })),
        ]);
      } catch (error) {
        if (!cancelled) {
          setCatalogError(
            error.message || "Không thể tải danh mục sản phẩm."
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "Tất cả" ||
        product.categoryName === activeCategory;

      const matchesSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.brandName.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, search]);

  function handleProductClick(product) {
    onNavigate?.(`/products/${product.id}`);
  }

  function handleAddToCart(product) {
    onAddToCart?.(product);
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

          {catalogError && (
            <div className="store-no-products" role="alert">
              <h3>Không thể tải sản phẩm</h3>
              <p>{catalogError}</p>
            </div>
          )}

          {catalogLoading && (
            <div className="store-no-products" role="status">
              <p>Đang tải sản phẩm...</p>
            </div>
          )}

          <div className="store-product-grid">
            {!catalogLoading && filteredProducts.map((product) => (
              <article className="store-product-card" key={product.id}>
                <button
                  className="store-product-visual-button"
                  onClick={() => handleProductClick(product)}
                  aria-label={`Xem ${product.name}`}
                >
                  <div className={`store-product-visual ${product.tone}`}>
                    {product.isFeatured && (
                      <span className="store-product-badge">NỔI BẬT</span>
                    )}
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        loading="lazy"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          padding: 18,
                        }}
                      />
                    ) : (
                      <span className="store-product-art">{product.icon}</span>
                    )}
                    <span className="store-product-art-label">
                      {product.brandName}
                    </span>
                  </div>
                </button>

                <div className="store-product-info">
                  <span className="store-product-brand">
                    {product.brandName}
                  </span>
                  <button
                    className="store-product-name"
                    onClick={() => handleProductClick(product)}
                  >
                    {product.name}
                  </button>

                  <div className="store-product-rating">
                    <small>{product.categoryName}</small>
                    <small>{product.inStock ? "Còn hàng" : "Tạm hết hàng"}</small>
                  </div>

                  <div className="store-product-price">
                    <strong>{formatPrice(product.price)}</strong>
                  </div>

                  <button
                    className="store-add-cart-button"
                    onClick={() => handleAddToCart(product)}
                    disabled={!product.inStock}
                    title={!product.inStock ? "Sản phẩm hiện tạm hết hàng" : "Thêm vào giỏ hàng"}
                  >
                    {product.inStock ? "+ THÊM VÀO GIỎ" : "TẠM HẾT HÀNG"}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!catalogLoading && !catalogError && filteredProducts.length === 0 && (
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
            <button onClick={() => onOpenSupport?.()}>
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
  </div>
  );
}

