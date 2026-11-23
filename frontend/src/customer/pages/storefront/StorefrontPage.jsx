
import { useEffect, useMemo, useState } from "react";
import "./storefront.css";

import heroImage from "../../../assets/hero.png";

import {
  getCustomerCatalogProducts,
  getCustomerCatalogCategories,
} from "../../services/catalog.service";

const ALL_CATEGORY = {
  id: null,
  name: "Tất cả",
};

const CATEGORY_IMAGES = {
  racket:
    "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=900&q=85",
  shoes:
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85",
  apparel:
    "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=900&q=85",
  accessories:
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900&q=85",
  default:
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=900&q=85",
};

const SPORTS = [
  {
    name: "Cầu lông",
    subtitle: "BADMINTON",
    description: "Trang bị dành cho tốc độ và sự chính xác.",
    keywords: ["cầu lông", "vợt cầu lông", "giày cầu lông"],
    image:
      "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1000&q=85",
  },
  {
    name: "Pickleball",
    subtitle: "PICKLEBALL",
    description: "Khám phá những lựa chọn cho cuộc chơi mới.",
    keywords: ["pickleball"],
    image:
      "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1000&q=85",
  },
  {
    name: "Thể thao",
    subtitle: "SPORTS & FITNESS",
    description: "Thiết bị và phụ kiện cho lối sống năng động.",
    keywords: [],
    image:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1000&q=85",
  },
];

function getCategoryImage(category) {
  const directImage =
    category?.imageUrl ||
    category?.image?.imageUrl ||
    category?.thumbnailUrl ||
    category?.bannerUrl;

  if (directImage) return directImage;

  const name = String(category?.name || "").toLowerCase();

  if (name.includes("vợt") || name.includes("cầu")) {
    return CATEGORY_IMAGES.racket;
  }

  if (name.includes("giày")) {
    return CATEGORY_IMAGES.shoes;
  }

  if (
    name.includes("áo") ||
    name.includes("quần") ||
    name.includes("trang phục")
  ) {
    return CATEGORY_IMAGES.apparel;
  }

  if (name.includes("phụ kiện")) {
    return CATEGORY_IMAGES.accessories;
  }

  return CATEGORY_IMAGES.default;
}

function getProductImage(product) {
  const productImages = Array.isArray(product.images)
    ? product.images
    : [];

  const variantImages = (product.variants || []).flatMap(
    (variant) => variant.images || []
  );

  const images = [...productImages, ...variantImages];

  return (
    images.find((image) => image.isPrimary)?.imageUrl ||
    images[0]?.imageUrl ||
    ""
  );
}

function mapCatalogProduct(product) {
  const variants = Array.isArray(product.variants)
    ? product.variants
    : [];

  const availableQuantity = variants.reduce((total, variant) => {
    if (typeof variant.availableQuantity === "number") {
      return total + Math.max(0, variant.availableQuantity);
    }

    if (variant.inventory) {
      return (
        total +
        Math.max(
          0,
          Number(variant.inventory.quantityOnHand || 0) -
          Number(variant.inventory.reservedQuantity || 0)
        )
      );
    }

    return total + (variant.inStock ? 1 : 0);
  }, 0);

  return {
    ...product,
    brandName: product.brand?.name || "QMD SPORT",
    categoryName: product.category?.name || "Khác",
    imageUrl: getProductImage(product),
    inStock: availableQuantity > 0,
    availableQuantity,
  };
}

const formatPrice = (value) =>
  new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "₫";

function ProductCard({
  product,
  index,
  featured = false,
  onProductClick,
}) {
  return (
    <article className="store-product-card" key={product.id}>
      <div className="store-product-card-top">
        <span className="store-product-index">
          {String(index + 1).padStart(2, "0")}
        </span>

        {featured && (
          <span className="store-product-badge">
            ✦ SẢN PHẨM NỔI BẬT
          </span>
        )}

        {!product.inStock && (
          <span className="store-product-stock is-unavailable">
            Hết hàng
          </span>
        )}
      </div>

      <button
        type="button"
        className="store-product-visual-button"
        onClick={() => onProductClick(product)}
        aria-label={`Xem ${product.name}`}
      >
        <div className="store-product-visual">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
            />
          ) : (
            <span className="store-product-art">QMD</span>
          )}

          <span className="store-product-art-label">
            {product.brandName}
          </span>

          <span className="store-product-view">
            XEM CHI TIẾT ↗
          </span>
        </div>
      </button>

      <div className="store-product-info">
        <div className="store-product-meta">
          <span className="store-product-brand">
            {product.brandName}
          </span>

          <span
            className={`store-product-stock ${product.inStock
              ? "is-available"
              : "is-unavailable"
              }`}
          >
            <i />
            {product.inStock ? "Còn hàng" : "Hết hàng"}
          </span>
        </div>

        <button
          type="button"
          className="store-product-name"
          onClick={() => onProductClick(product)}
          title={product.name}
        >
          {product.name}
        </button>

        <div className="store-product-category">
          {product.categoryName}
        </div>

        <div className="store-product-price-row">
          <strong className="store-product-price">
            {formatPrice(product.price)}
          </strong>
          <span className="store-product-price-label">
            Giá bán
          </span>
        </div>

        <button
          type="button"
          className="store-add-cart-button"
          disabled={!product.inStock}
          onClick={() => onProductClick(product)}
          title={
            product.inStock
              ? "Chọn phân loại và thêm vào giỏ hàng"
              : "Sản phẩm hiện tạm hết hàng"
          }
        >
          <span>
            {product.inStock ? "MUA NGAY" : "TẠM HẾT HÀNG"}
          </span>
          <span className="store-add-cart-icon">
            {product.inStock ? "↗" : "—"}
          </span>
        </button>
      </div>
    </article>
  );
}

export default function StorefrontPage({
  user,
  cartCount = 0,
  onNavigate,
  onRequireLogin,
  onAddToCart,
  onOpenSupport,
}) {
  const [products, setProducts] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories] = useState([ALL_CATEGORY]);

  const brandProfiles = [
    {
      id: "victor",
      name: "VICTOR",
      country: "Đài Loan",
      founded: "1968",
      tagline: "READY TO WIN",
      description:
        "VICTOR là thương hiệu thể thao chuyên về cầu lông, được thành lập tại Đài Bắc năm 1968. Thương hiệu tập trung nghiên cứu và phát triển vợt, giày, trang phục cùng các thiết bị cầu lông.",
      videoId: "BEwYwP7JKjg",
      videoTitle: "The Journey to Greatness",
      channelUrl: "https://www.youtube.com/@victorsportglobal",
    },
    {
      id: "li-ning",
      name: "LI-NING",
      country: "Trung Quốc",
      founded: "1990",
      tagline: "ANYTHING IS POSSIBLE",
      description:
        "LI-NING được thành lập năm 1990 bởi vận động viên thể dục dụng cụ Li Ning. Thương hiệu phát triển các sản phẩm thể thao và trang phục phục vụ nhiều bộ môn, trong đó có cầu lông.",
      videoId: null,
      videoTitle: "",
      channelUrl: "https://www.youtube.com/@liningofficial",
    },
    {
      id: "yonex",
      name: "YONEX",
      country: "Nhật Bản",
      founded: "1946",
      tagline: "MADE FOR THE GAME",
      description:
        "YONEX là thương hiệu thể thao Nhật Bản với các sản phẩm phục vụ cầu lông, tennis và nhiều bộ môn khác. Thương hiệu chú trọng nghiên cứu, đổi mới và phát triển thiết bị thể thao.",
      videoId: "p_yig0CYgBc",
      videoTitle: "We Strive Together | Viktor Axelsen Collection",
      channelUrl: "https://www.youtube.com/@yonex",
    },
  ];

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [featuredError, setFeaturedError] = useState("");

  const [activeCategory, setActiveCategory] = useState("Tất cả");

  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(null);
  // =========================================
  // LOAD CATALOG
  // =========================================

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setCatalogLoading(true);
      setFeaturedLoading(true);
      setCatalogError("");
      setFeaturedError("");

      const productRequest = getCustomerCatalogProducts({
        page: 1,
        limit: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const featuredRequest = getCustomerCatalogProducts({
        page: 1,
        limit: 8,
        sortBy: "createdAt",
        sortOrder: "desc",
        featured: true,
      });

      const categoryRequest = getCustomerCatalogCategories();

      const [productResult, featuredResult, categoryResult] =
        await Promise.allSettled([
          productRequest,
          featuredRequest,
          categoryRequest,
        ]);

      if (cancelled) return;

      if (productResult.status === "fulfilled") {
        const items = Array.isArray(productResult.value?.data)
          ? productResult.value.data
          : [];

        setProducts(items.map(mapCatalogProduct));
      } else {
        setCatalogError(
          productResult.reason?.message ||
          "Không thể tải danh sách sản phẩm."
        );
      }

      if (featuredResult.status === "fulfilled") {
        const items = Array.isArray(featuredResult.value?.data)
          ? featuredResult.value.data
          : [];

        setFeaturedProducts(items.map(mapCatalogProduct));
      } else {
        setFeaturedError(
          featuredResult.reason?.message ||
          "Không thể tải sản phẩm nổi bật."
        );
      }

      if (categoryResult.status === "fulfilled") {
        const items = Array.isArray(categoryResult.value?.data)
          ? categoryResult.value.data
          : [];

        setCategories([
          ALL_CATEGORY,
          ...items.map((category) => ({
            ...category,
            imageUrl: getCategoryImage(category),
          })),
        ]);
      }

      setCatalogLoading(false);
      setFeaturedLoading(false);
    }

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================
  // FILTER PRODUCTS
  // =========================================

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "Tất cả" ||
        product.categoryName === activeCategory;

      const matchesSearch =
        !keyword ||
        product.name?.toLowerCase().includes(keyword) ||
        product.brandName.toLowerCase().includes(keyword) ||
        product.categoryName.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, search]);

  const brands = useMemo(() => {
    const uniqueBrands = new Map();

    products.forEach((product) => {
      const name = product.brand?.name;

      if (name) {
        uniqueBrands.set(name, product.brand);
      }
    });

    return [...uniqueBrands.values()];
  }, [products]);

  // =========================================
  // HANDLERS
  // =========================================

  function handleBrandProducts(brandName) {
    setSelectedBrand(null);
    setActiveCategory("Tất cả");
    setSearch(brandName);

    requestAnimationFrame(() => {
      document
        .querySelector(".store-products-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleProductClick(product) {
    onNavigate?.(`/products/${product.id}`);
  }

  function handleAddToCart(product) {
    onAddToCart?.(product);
  }

  function handleCategoryClick(categoryName) {
    setActiveCategory(categoryName);

    document
      .querySelector(".store-products-section")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  function handleResetFilters() {
    setSearch("");
    setActiveCategory("Tất cả");
  }

  function handleSearchFocus() {
    document
      .querySelector(".store-products-section")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  function handleSportClick(sport) {
    if (!sport.keywords.length) {
      onNavigate?.("/products");
      return;
    }

    const matchedCategory = categories.find((category) =>
      sport.keywords.some((keyword) =>
        category.name.toLowerCase().includes(keyword)
      )
    );

    if (matchedCategory) {
      handleCategoryClick(matchedCategory.name);
    } else {
      onNavigate?.("/products");
    }
  }

  // =========================================
  // RENDER
  // =========================================

  return (
    <div className="storefront">
      {/* ANNOUNCEMENT */}
      <div className="store-announcement">
        <span>✦</span>
        MIỄN PHÍ VẬN CHUYỂN CHO ĐƠN HÀNG TỪ 1.000.000₫
        <span className="store-announcement-separator">·</span>
        ƯU ĐÃI ĐẶC BIỆT TẠI QMD SPORT
      </div>

      {/* HEADER */}
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
            Tất cả sản phẩm
          </button>

          <button
            onClick={() => handleCategoryClick("Vợt cầu lông")}
          >
            Cầu lông
          </button>

          <button
            onClick={() => handleCategoryClick("Pickleball")}
          >
            Pickleball
          </button>

          <button onClick={() => onOpenSupport?.()}>
            Liên hệ
          </button>
        </nav>

        <div className="store-header-actions">
          <button
            type="button"
            className="store-icon-button"
            title="Tìm kiếm sản phẩm"
            onClick={handleSearchFocus}
          >
            ⌕
          </button>

          <button
            type="button"
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
              type="button"
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
              type="button"
              className="store-login-button"
              onClick={onRequireLogin}
            >
              Đăng nhập <span>↗</span>
            </button>
          )}
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="store-hero">
          <div className="store-hero-content">
            <span className="store-eyebrow">
              <span /> QMD SPORT — PERFORMANCE & LIFESTYLE
            </span>

            <h1>
              PLAY
              <br />
              <span>YOUR</span>
              <br />
              GAME.
            </h1>

            <p>
              Khám phá thế giới thể thao cùng những sản phẩm
              chất lượng. Trang bị phù hợp, tự tin theo đuổi
              phong cách và mục tiêu của riêng bạn.
            </p>

            <div className="store-hero-actions">
              <button
                type="button"
                className="store-primary-button"
                onClick={() => onNavigate?.("/products")}
              >
                KHÁM PHÁ SẢN PHẨM <span>↗</span>
              </button>

              <button
                type="button"
                className="store-secondary-button"
                onClick={() =>
                  document
                    .querySelector(".store-categories-section")
                    ?.scrollIntoView({
                      behavior: "smooth",
                    })
                }
              >
                Khám phá danh mục
              </button>
            </div>

            <div className="store-hero-stats">
              <div>
                <strong>{products.length}+</strong>
                <span>Sản phẩm</span>
              </div>

              <div>
                <strong>{categories.length - 1}+</strong>
                <span>Danh mục</span>
              </div>

              <div>
                <strong>QMD</strong>
                <span>Sports store</span>
              </div>
            </div>
          </div>

          <div className="store-hero-visual">
            <img
              className="store-hero-image"
              src={heroImage}
              alt="Bộ sưu tập sản phẩm thể thao QMD Sport"
            />

            <div className="store-hero-image-shade" />
            <div className="store-hero-circle" />
            <div className="store-hero-decoration">QMD</div>

            <div className="store-hero-label">
              <small>PERFORMANCE COLLECTION</small>
              <strong>POWER YOUR GAME</strong>
              <span>QMD SPORT / 2026</span>
            </div>

            <div className="store-hero-floating-tag">
              <span>✦</span>
              BUILT FOR PERFORMANCE
            </div>
          </div>
        </section>

        {/* BENEFITS */}
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

                <section className="store-passion-section">
          <div className="store-passion-heading">
            <div>
              <span className="store-section-eyebrow">
                FIND YOUR PASSION
              </span>
              <h2>Chọn môn thể thao của bạn</h2>
              <p>
                Mỗi cuộc chơi có một phong cách.
                QMD Sport đồng hành cùng hành trình của bạn.
              </p>
            </div>
            <span className="store-passion-index">01 — 03</span>
          </div>

          <div className="store-passion-grid">
            <button
              type="button"
              className="store-passion-card passion-badminton"
              onClick={() =>
                onNavigate?.("/products?category=Vợt cầu lông")
              }
            >
              <img
                src="https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=85"
                alt="Người chơi cầu lông trên sân"
                loading="lazy"
              />
              <span className="store-passion-overlay" />
              <span className="store-passion-content">
                <small>01 / COURT PERFORMANCE</small>
                <strong>BADMINTON</strong>
                <span>Cầu lông</span>
                <em>
                  Khám phá trang bị <b>↗</b>
                </em>
              </span>
            </button>

            <button
              type="button"
              className="store-passion-card passion-pickleball"
              onClick={() => onNavigate?.("/products")}
            >
              <img
                src="https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=85"
                alt="Sân thể thao với người chơi"
                loading="lazy"
              />
              <span className="store-passion-overlay" />
              <span className="store-passion-content">
                <small>02 / THE NEW GAME</small>
                <strong>PICKLEBALL</strong>
                <span>Pickleball</span>
                <em>
                  Khám phá trang bị <b>↗</b>
                </em>
              </span>
            </button>

            <button
              type="button"
              className="store-passion-card passion-apparel"
              onClick={() => onNavigate?.("/products")}
            >
              <img
                src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=85"
                alt="Trang phục thể thao"
                loading="lazy"
              />
              <span className="store-passion-overlay" />
              <span className="store-passion-content">
                <small>03 / EVERYDAY PERFORMANCE</small>
                <strong>APPAREL &amp; ACCESSORIES</strong>
                <span>Trang phục & phụ kiện</span>
                <em>
                  Khám phá bộ sưu tập <b>↗</b>
                </em>
              </span>
            </button>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="store-categories-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">
                SHOP BY CATEGORY
              </span>

              <h2>Khám phá danh mục</h2>

              <p>
                Tìm kiếm trang bị phù hợp với nhu cầu và phong
                cách thể thao của bạn.
              </p>
            </div>

            <button
              type="button"
              className="store-text-link"
              onClick={() => onNavigate?.("/products")}
            >
              Tất cả sản phẩm ↗
            </button>
          </div>

          {categories.length > 1 ? (
            <div className="store-category-grid">
              {categories.slice(1).map((category, index) => (
                <button
                  type="button"
                  key={category.id ?? category.name}
                  className={`store-category-card category-${index + 1}`}
                  onClick={() =>
                    handleCategoryClick(category.name)
                  }
                >
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    loading="lazy"
                  />

                  <span className="store-category-overlay" />

                  <span className="store-category-name">
                    {category.name}
                  </span>

                  <span className="store-category-arrow">
                    ↗
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="store-no-products">
              {catalogLoading
                ? "Đang tải danh mục..."
                : "Danh mục sản phẩm đang được cập nhật."}
            </div>
          )}
        </section>

        {/* FEATURED PRODUCTS */}
        <section className="store-products-section store-featured-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">
                SELECTED FOR YOU
              </span>

              <h2>Sản phẩm nổi bật</h2>

              <p>
                Những sản phẩm được lựa chọn để bạn khám phá.
              </p>
            </div>

            <button
              type="button"
              className="store-text-link"
              onClick={() => onNavigate?.("/products")}
            >
              Khám phá cửa hàng ↗
            </button>
          </div>

          {featuredLoading ? (
            <div className="store-no-products" role="status">
              Đang tải sản phẩm nổi bật...
            </div>
          ) : featuredError ? (
            <div className="store-no-products" role="alert">
              <h3>Không thể tải sản phẩm nổi bật</h3>
              <p>{featuredError}</p>
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="store-product-grid">
              {featuredProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  featured
                  onProductClick={handleProductClick}
                />
              ))}
            </div>
          ) : (
            <div className="store-no-products">
              <h3>Chưa có sản phẩm nổi bật</h3>
              <p>
                Các sản phẩm được lựa chọn sẽ xuất hiện tại đây.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.("/products")}
              >
                KHÁM PHÁ SẢN PHẨM ↗
              </button>
            </div>
          )}
        </section>

        {/* SPORTS DISCOVERY */}
        <section className="store-sports-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">
                FIND YOUR PASSION
              </span>

              <h2>Chọn môn thể thao của bạn</h2>

              <p>
                Mỗi cuộc chơi có một phong cách. QMD Sport đồng
                hành cùng hành trình của bạn.
              </p>
            </div>
          </div>

          <div className="store-sports-grid">
            {SPORTS.map((sport, index) => (
              <button
                type="button"
                className={`store-sport-card store-sport-card-${index + 1}`}
                key={sport.name}
                onClick={() => handleSportClick(sport)}
              >
                <img
                  src={sport.image}
                  alt={sport.name}
                  loading="lazy"
                />

                <span className="store-sport-overlay" />

                <span className="store-sport-content">
                  <small>{sport.subtitle}</small>
                  <strong>{sport.name}</strong>
                  <span>{sport.description}</span>
                  <b>KHÁM PHÁ NGAY ↗</b>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ALL PRODUCTS */}
        <section className="store-products-section store-all-products-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">
                THE QMD SPORT STORE
              </span>

              <h2>Tất cả sản phẩm</h2>

              <p>
                Tìm kiếm và khám phá các sản phẩm đang có tại
                cửa hàng.
              </p>
            </div>

            <span className="store-product-result-count">
              {String(filteredProducts.length).padStart(2, "0")} ITEMS
            </span>
          </div>

          <div className="store-product-toolbar">
            <div className="store-category-filters">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id ?? category.name}
                  className={
                    activeCategory === category.name
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveCategory(category.name)
                  }
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
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Tìm sản phẩm, thương hiệu..."
              />
            </label>
          </div>

          <div className="store-product-results">
            <div className="store-product-results-info">
              <div>
                <span className="store-section-eyebrow">
                  QMD SPORT / COLLECTION
                </span>

                <h3>
                  {activeCategory === "Tất cả"
                    ? "Danh sách sản phẩm"
                    : activeCategory}
                </h3>

                <p>
                  Hiển thị{" "}
                  <strong>{filteredProducts.length}</strong>{" "}
                  sản phẩm
                  {search.trim()
                    ? ` phù hợp với "${search.trim()}"`
                    : ""}
                </p>
              </div>
            </div>

            {catalogError && (
              <div className="store-no-products" role="alert">
                <h3>Không thể tải sản phẩm</h3>
                <p>{catalogError}</p>
              </div>
            )}

            {catalogLoading && (
              <div className="store-no-products" role="status">
                Đang tải danh sách sản phẩm...
              </div>
            )}

            {!catalogLoading &&
              !catalogError &&
              filteredProducts.length > 0 && (
                <div className="store-product-grid">
                  {filteredProducts.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      index={index}
                      onProductClick={handleProductClick}
                    />
                  ))}
                </div>
              )}

            {!catalogLoading &&
              !catalogError &&
              filteredProducts.length === 0 && (
                <div className="store-no-products">
                  <span>⌕</span>
                  <h3>Không tìm thấy sản phẩm</h3>
                  <p>
                    Hãy thử một từ khóa hoặc danh mục khác.
                  </p>

                  <button
                    type="button"
                    onClick={handleResetFilters}
                  >
                    XÓA BỘ LỌC ↗
                  </button>
                </div>
              )}
          </div>
        </section>

        <section className="store-brands-section">
          <div className="store-brands-heading">
            <div>
              <span className="store-section-eyebrow">OUR BRANDS</span>
              <h2>Thương hiệu tại QMD Sport</h2>
              <p>
                Khám phá câu chuyện và tinh thần của những thương hiệu
                thể thao đồng hành cùng QMD Sport.
              </p>
            </div>

            <span className="store-brands-count">BRAND STORIES / 03</span>
          </div>

          <div className="store-brands-grid">
            {brandProfiles.map((brand, index) => (
              <button
                type="button"
                key={brand.id}
                className={`store-brand-card store-brand-card-${index + 1}`}
                onClick={() => setSelectedBrand(brand)}
              >
                <span className="store-brand-card-number">
                  0{index + 1}
                </span>

                <span className="store-brand-card-name">
                  {brand.name}
                </span>

                <span className="store-brand-card-tagline">
                  {brand.tagline}
                </span>

                <span className="store-brand-card-action">
                  KHÁM PHÁ THƯƠNG HIỆU <span>↗</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* MEMBERSHIP */}
        <section className="store-promo-banner">
          <div>
            <span>QMD SPORT MEMBERSHIP</span>

            <h2>Chơi hết mình. Nhận nhiều ưu đãi.</h2>

            <p>
              Trở thành thành viên để theo dõi đơn hàng và nhận
              những ưu đãi dành riêng cho bạn.
            </p>

            <button
              type="button"
              onClick={() =>
                user
                  ? onNavigate?.("/account")
                  : onRequireLogin?.()
              }
            >
              {user
                ? "TÀI KHOẢN CỦA TÔI"
                : "THAM GIA NGAY"}{" "}
              ↗
            </button>
          </div>

          <div className="store-promo-decoration">Q</div>
        </section>

        {/* CUSTOMER TRUST */}
        <section className="store-trust-section">
          <div className="store-section-heading">
            <div>
              <span className="store-section-eyebrow">
                WHY QMD SPORT
              </span>

              <h2>Đồng hành cùng đam mê của bạn</h2>

              <p>
                Chúng tôi hướng đến trải nghiệm mua sắm rõ ràng,
                thuận tiện và đáng tin cậy.
              </p>
            </div>
          </div>

          <div className="store-trust-grid">
            <article>
              <span>01</span>
              <h3>Thông tin minh bạch</h3>
              <p>
                Thông tin sản phẩm và phân loại được trình bày
                rõ ràng trước khi đặt hàng.
              </p>
            </article>

            <article>
              <span>02</span>
              <h3>Lựa chọn phù hợp</h3>
              <p>
                Khám phá nhiều danh mục để tìm trang bị phù hợp
                với nhu cầu của bạn.
              </p>
            </article>

            <article>
              <span>03</span>
              <h3>Hỗ trợ khách hàng</h3>
              <p>
                Liên hệ đội ngũ hỗ trợ khi cần tư vấn hoặc giải
                đáp thắc mắc.
              </p>
            </article>
          </div>
        </section>

        {/* SUPPORT CTA */}
        <section className="store-support-section">
          <div>
            <span>QMD SPORT CUSTOMER CARE</span>
            <h2>Bạn cần chúng tôi hỗ trợ?</h2>
            <p>
              Đội ngũ QMD Sport sẵn sàng hỗ trợ bạn trong quá
              trình tìm hiểu và mua sắm sản phẩm.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenSupport?.()}
          >
            LIÊN HỆ TƯ VẤN ↗
          </button>
        </section>
      </main>

      {selectedBrand && (
        <div
          className="store-brand-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedBrand(null);
            }
          }}
        >
          <section
            className="store-brand-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-brand-title"
          >
            <button
              type="button"
              className="store-brand-close"
              onClick={() => setSelectedBrand(null)}
              aria-label="Đóng giới thiệu"
            >
              ×
            </button>

            <div className="store-brand-dialog-header">
              <span>QMD SPORT / BRAND STORIES</span>
              <span>{selectedBrand.country.toUpperCase()}</span>
            </div>

            <div className="store-brand-dialog-content">
              <span className="store-brand-dialog-eyebrow">
                DISCOVER THE BRAND
              </span>

              <h2 id="store-brand-title">
                {selectedBrand.name}
              </h2>

              <p className="store-brand-dialog-tagline">
                {selectedBrand.tagline}
              </p>

              <div className="store-brand-facts">
                <div>
                  <span>QUỐC GIA</span>
                  <strong>{selectedBrand.country}</strong>
                </div>

                <div>
                  <span>THÀNH LẬP</span>
                  <strong>{selectedBrand.founded}</strong>
                </div>
              </div>

              <p className="store-brand-description">
                {selectedBrand.description}
              </p>

              <div className="store-brand-video-heading">
                <span>BRAND VIDEO</span>
                <span>OFFICIAL CHANNEL</span>
              </div>

              {selectedBrand.videoId ? (
                <div className="store-brand-video">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${selectedBrand.videoId}`}
                    title={`${selectedBrand.name} - ${selectedBrand.videoTitle}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="store-brand-video-placeholder">
                  <span className="store-brand-video-play">▶</span>
                  <strong>Video từ kênh chính thức LI-NING</strong>
                  <p>
                    Hiện chưa có video cụ thể được xác minh để nhúng.
                  </p>
                  <a
                    href={selectedBrand.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    XEM KÊNH YOUTUBE ↗
                  </a>
                </div>
              )}

              <a
                className="store-brand-channel-link"
                href={selectedBrand.channelUrl}
                target="_blank"
                rel="noreferrer"
              >
                TRUY CẬP KÊNH YOUTUBE CHÍNH THỨC ↗
              </a>
            </div>

            <div className="store-brand-dialog-footer">
              <span>QMD SPORT</span>
              <span>PLAY YOUR GAME.</span>
            </div>
          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="store-footer">
        <div className="store-footer-main">
          <div className="store-footer-brand">
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onNavigate?.("/");
              }}
            >
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
              Tất cả sản phẩm
            </button>

            <button
              onClick={() =>
                document
                  .querySelector(".store-categories-section")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Danh mục
            </button>

            <button onClick={() => onNavigate?.("/cart")}>
              Giỏ hàng
            </button>
          </div>

          <div>
            <strong>Khách hàng</strong>

            <button onClick={() => onNavigate?.("/orders")}>
              Đơn hàng của tôi
            </button>

            <button
              onClick={() => onNavigate?.("/account/profile")}
            >
              Tài khoản
            </button>
          </div>

          <div>
            <strong>Hỗ trợ</strong>

            <button onClick={() => onOpenSupport?.()}>
              Chat với chúng tôi
            </button>

            <button onClick={() => onOpenSupport?.()}>
              Liên hệ tư vấn
            </button>
          </div>
        </div>

        <div className="store-footer-bottom">
          <span>
            © 2026 QMD SPORT. ALL RIGHTS RESERVED.
          </span>

          <span>PLAY YOUR GAME.</span>
        </div>
      </footer>
    </div>
  );
}
