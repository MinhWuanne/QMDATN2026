
import { useEffect, useMemo, useState } from "react";
import "./product-detail.css";

import { getCustomerCatalogProduct } from "../../services/catalog.service.js";
import { addCustomerCartItem } from "../../services/cart.service.js";

const formatPrice = (value) =>
  new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "₫";

function getAvailableQuantity(variant) {
  if (typeof variant.availableQuantity === "number") {
    return Math.max(0, variant.availableQuantity);
  }

  if (variant.inventory) {
    return Math.max(
      0,
      Number(variant.inventory.quantityOnHand || 0) -
      Number(variant.inventory.reservedQuantity || 0)
    );
  }

  return variant.inStock ? 1 : 0;
}

function getImages(product, variant) {
  const variantImages = Array.isArray(variant?.images)
    ? variant.images
    : [];

  const productImages = (product.images || []).filter(
    (image) => !image.variantId
  );

  const images = [...variantImages, ...productImages];

  return images.filter(
    (image, index, array) =>
      image.imageUrl &&
      array.findIndex((item) => item.imageUrl === image.imageUrl) === index
  );
}

function getVariantDescription(variant) {
  if (variant.name) return variant.name;

  if (
    variant.attributes &&
    typeof variant.attributes === "object"
  ) {
    return Object.entries(variant.attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");
  }

  return variant.sku || "Phân loại sản phẩm";
}

function getProductSpecifications(product, variant) {
  const specifications = [
    {
      label: "Thương hiệu",
      value: product.brand?.name,
    },
    {
      label: "Danh mục",
      value: product.category?.name,
    },
    {
      label: "Mã SKU",
      value: variant?.sku,
    },
    {
      label: "Phân loại",
      value: variant ? getVariantDescription(variant) : null,
    },
    {
      label: "Trọng lượng",
      value:
        variant?.weightGrams != null
          ? `${variant.weightGrams} g`
          : null,
    },
  ];

  return specifications.filter(
    (item) =>
      item.value !== null &&
      item.value !== undefined &&
      String(item.value).trim() !== ""
  );
}

export default function ProductDetailPage({
  productId,
  user,
  accessToken,
  onNavigate,
  onRequireLogin,
  onSessionRefresh,
  onSessionExpired,
  onBuyNow,
  onOpenSupport,
}) {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedImage, setSelectedImage] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      setLoading(true);
      setError("");
      setProduct(null);
      setSelectedVariantId("");
      setSelectedImage("");
      setQuantity(1);

      try {
        const result = await getCustomerCatalogProduct(productId);

        if (cancelled) return;

        const data = result?.data;

        if (!data) {
          throw new Error("Không tìm thấy thông tin sản phẩm.");
        }

        const activeVariants = (data.variants || []).filter(
          (variant) => variant.isActive !== false
        );

        setProduct({
          ...data,
          variants: activeVariants,
        });

        const firstAvailable = activeVariants.find(
          (variant) => getAvailableQuantity(variant) > 0
        );

        const firstVariant = firstAvailable || activeVariants[0];

        if (firstVariant) {
          setSelectedVariantId(firstVariant.id);

          const images = getImages(data, firstVariant);
          setSelectedImage(images[0]?.imageUrl || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Không thể tải thông tin sản phẩm."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (productId) {
      loadProduct();
    } else {
      setError("Không xác định được sản phẩm.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const selectedVariant = useMemo(
    () =>
      product?.variants?.find(
        (variant) => variant.id === selectedVariantId
      ) || null,
    [product, selectedVariantId]
  );

  const availableQuantity = selectedVariant
    ? getAvailableQuantity(selectedVariant)
    : 0;

  const images = useMemo(
    () => (product ? getImages(product, selectedVariant) : []),
    [product, selectedVariant]
  );

  useEffect(() => {
    if (!images.length) {
      setSelectedImage("");
      return;
    }

    if (!images.some((image) => image.imageUrl === selectedImage)) {
      setSelectedImage(images[0].imageUrl);
    }
  }, [images, selectedImage]);

  function handleSelectVariant(variant) {
    setSelectedVariantId(variant.id);
    setQuantity(1);
    setActionMessage("");
    setActionError("");
  }

  function handleQuantityChange(nextQuantity) {
    const next = Number(nextQuantity);

    if (!Number.isInteger(next) || next < 1) return;

    setQuantity(Math.min(next, availableQuantity));
  }

  function requireCustomer() {
    if (user) return true;

    onRequireLogin?.();
    return false;
  }

  async function handleAddToCart() {
    if (!requireCustomer()) return;

    if (!selectedVariant || availableQuantity < 1) {
      setActionError("Phân loại này hiện không còn hàng.");
      return;
    }

    if (quantity > availableQuantity) {
      setActionError("Số lượng vượt quá tồn kho hiện có.");
      return;
    }

    setAdding(true);
    setActionError("");
    setActionMessage("");

    try {
      await addCustomerCartItem({
        accessToken,
        variantId: selectedVariant.id,
        quantity,
      });

      setActionMessage("Đã thêm sản phẩm vào giỏ hàng.");
    } catch (err) {
      if (err.status === 401 && onSessionRefresh) {
        try {
          const nextSession = await onSessionRefresh();

          await addCustomerCartItem({
            accessToken: nextSession.accessToken,
            variantId: selectedVariant.id,
            quantity,
          });

          setActionMessage("Đã thêm sản phẩm vào giỏ hàng.");
          return;
        } catch (retryError) {
          if (retryError.status === 401) {
            onSessionExpired?.();
          } else {
            setActionError(
              retryError.message || "Không thể thêm vào giỏ hàng."
            );
          }
          return;
        }
      }

      setActionError(
        err.message || "Không thể thêm vào giỏ hàng."
      );
    } finally {
      setAdding(false);
    }
  }

  function handleBuyNow() {
    if (!requireCustomer()) return;

    if (!selectedVariant || availableQuantity < 1) {
      setActionError("Phân loại này hiện không còn hàng.");
      return;
    }

    if (quantity > availableQuantity) {
      setActionError("Số lượng vượt quá tồn kho hiện có.");
      return;
    }

    setBuying(true);
    setActionError("");
    setActionMessage("");

    try {
      const image =
        selectedImage ||
        images[0]?.imageUrl ||
        "";

      onBuyNow?.({
        variantId: selectedVariant.id,
        quantity,
        product: {
          name: product.name,
          price: product.price,
          images: image ? [{ imageUrl: image }] : [],
        },
        variant: {
          name: selectedVariant.name || "",
          attributes: selectedVariant.attributes || {},
          sku: selectedVariant.sku || "",
        },
      });
    } catch (err) {
      setActionError(
        err.message || "Không thể chuyển đến trang thanh toán."
      );
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return (
      <main className="product-detail-state">
        <div className="product-detail-loader" />
        <p>Đang tải thông tin sản phẩm...</p>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="product-detail-state">
        <h2>Không thể hiển thị sản phẩm</h2>
        <p>{error || "Sản phẩm không tồn tại."}</p>
        <button onClick={() => onNavigate?.("/")}>
          Quay lại cửa hàng
        </button>
      </main>
    );
  }

  const productInStock = product.variants.some(
    (variant) => getAvailableQuantity(variant) > 0
  );

  return (
    <main className="product-detail-page">
      <div className="product-detail-breadcrumb">
        <button onClick={() => onNavigate?.("/")}>Trang chủ</button>
        <span>/</span>
        <span>{product.category?.name || "Sản phẩm"}</span>
        <span>/</span>
        <strong>{product.name}</strong>
      </div>

      <section className="product-detail-layout">
        <div className="product-detail-gallery">
          <div className="product-detail-main-image">
            {selectedImage ? (
              <img src={selectedImage} alt={product.name} />
            ) : (
              <div className="product-detail-no-image">
                🏸
                <span>Chưa có hình ảnh</span>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="product-detail-thumbnails">
              {images.map((image) => (
                <button
                  key={image.id || image.imageUrl}
                  className={
                    selectedImage === image.imageUrl ? "active" : ""
                  }
                  onClick={() => setSelectedImage(image.imageUrl)}
                >
                  <img
                    src={image.imageUrl}
                    alt={image.altText || product.name}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-detail-information">
          <div className="product-detail-brand">
            {product.brand?.name || "QMD SPORT"}
          </div>

          <h1>{product.name}</h1>

          {product.category?.name && (
            <div className="product-detail-category">
              Danh mục: {product.category.name}
            </div>
          )}

          <div className="product-detail-price">
            {formatPrice(product.price)}
          </div>

          <div className="product-detail-stock">
            {productInStock ? (
              <span className="in-stock">Còn hàng</span>
            ) : (
              <span className="out-stock">Tạm hết hàng</span>
            )}
          </div>

          <div className="product-detail-divider" />

          <div className="product-detail-option">
            <label>Chọn phân loại</label>

            {product.variants.length > 0 ? (
              <div className="product-detail-variants">
                {product.variants.map((variant) => {
                  const stock = getAvailableQuantity(variant);
                  const disabled = stock < 1;

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={disabled}
                      className={
                        selectedVariantId === variant.id ? "active" : ""
                      }
                      onClick={() => handleSelectVariant(variant)}
                    >
                      <span>{getVariantDescription(variant)}</span>
                      {disabled && <small>Hết hàng</small>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p>Sản phẩm hiện chưa có phân loại.</p>
            )}
          </div>

          {selectedVariant && (
            <div className="product-detail-selected">
              <span>Đang chọn:</span>
              <strong>{getVariantDescription(selectedVariant)}</strong>
            </div>
          )}

          <div className="product-detail-option">
            <label>Số lượng</label>

            <div className="product-detail-quantity">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => handleQuantityChange(quantity - 1)}
              >
                −
              </button>

              <input
                type="number"
                min="1"
                max={availableQuantity}
                value={quantity}
                disabled={availableQuantity < 1}
                onChange={(event) =>
                  handleQuantityChange(event.target.value)
                }
              />

              <button
                type="button"
                disabled={
                  availableQuantity < 1 ||
                  quantity >= availableQuantity
                }
                onClick={() => handleQuantityChange(quantity + 1)}
              >
                +
              </button>
            </div>

            {selectedVariant && (
              <small>
                Còn {availableQuantity} sản phẩm có thể đặt
              </small>
            )}
          </div>

          {actionError && (
            <div className="product-detail-error" role="alert">
              {actionError}
            </div>
          )}

          {actionMessage && (
            <div className="product-detail-success" role="status">
              {actionMessage}
            </div>
          )}

          <div className="product-detail-actions">
            <button
              type="button"
              className="product-detail-add"
              disabled={
                adding ||
                !selectedVariant ||
                availableQuantity < 1
              }
              onClick={handleAddToCart}
            >
              {adding ? "ĐANG THÊM..." : "THÊM VÀO GIỎ"}
            </button>

            <button
              type="button"
              className="product-detail-buy"
              disabled={
                buying ||
                !selectedVariant ||
                availableQuantity < 1
              }
              onClick={handleBuyNow}
            >
              {buying ? "ĐANG XỬ LÝ..." : "MUA NGAY"}
            </button>
          </div>

          <div className="product-detail-benefits">
            <div>✓ Sản phẩm chính hãng</div>
            <div>✓ Hỗ trợ tư vấn lựa chọn</div>
            <div>✓ Hỗ trợ đổi trả theo chính sách</div>
          </div>
        </div>
      </section>

      <section className="product-detail-content">
        <div className="product-detail-section-heading">
          <span>THÔNG TIN SẢN PHẨM</span>
          <h2>Khám phá chi tiết sản phẩm</h2>
          <p>
            Những thông tin cần thiết giúp bạn tìm hiểu sản phẩm
            trước khi lựa chọn.
          </p>
        </div>

        <div className="product-detail-content-grid">
          <article className="product-detail-description">
            <div className="product-detail-content-title">
              <span className="product-detail-title-icon">✦</span>
              <h3>Mô tả sản phẩm</h3>
            </div>

            {product.description ? (
              <p>{product.description}</p>
            ) : (
              <p className="product-detail-empty-description">
                Thông tin mô tả của sản phẩm đang được cập nhật.
              </p>
            )}
          </article>

          <article className="product-detail-specifications">
            <div className="product-detail-content-title">
              <span className="product-detail-title-icon">▤</span>
              <h3>Thông tin chi tiết</h3>
            </div>

            {getProductSpecifications(product, selectedVariant).length >
              0 ? (
              <div className="product-detail-specification-list">
                {getProductSpecifications(product, selectedVariant).map(
                  (item) => (
                    <div
                      className="product-detail-specification-row"
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="product-detail-empty-description">
                Chưa có thông tin chi tiết cho sản phẩm này.
              </p>
            )}
          </article>
        </div>
      </section>

      <section className="product-detail-support">
        <div className="product-detail-support-icon">🏸</div>

        <div className="product-detail-support-content">
          <span>LAN ANH SPORT SUPPORT</span>
          <h3>Bạn cần tư vấn lựa chọn sản phẩm?</h3>
          <p>
            Liên hệ với chúng tôi để được hỗ trợ tìm hiểu sản phẩm
            và lựa chọn phân loại phù hợp.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenSupport?.()}
        >
          Liên hệ tư vấn
          <span>→</span>
        </button>
      </section>

      <div className="product-detail-bottom-actions">
        <button
          type="button"
          className="product-detail-continue"
          onClick={() => onNavigate?.("/")}
        >
          <span>←</span>
          Tiếp tục mua sắm
        </button>

        {user && (
          <button
            type="button"
            className="product-detail-view-cart"
            onClick={() => onNavigate?.("/cart")}
          >
            Xem giỏ hàng
            <span>→</span>
          </button>
        )}
      </div>
    </main>
  );
}
