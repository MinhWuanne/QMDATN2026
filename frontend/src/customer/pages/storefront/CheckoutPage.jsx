
import { useCallback, useEffect, useMemo, useState } from "react";

import { getCustomerCart } from "../../services/cart.service.js";
import { getMyAddresses } from "../../services/address.service.js";
import {
  createMemberOrder,
  createMemberBuyNowOrder,
  startMemberCheckout,
  validateMemberVoucher,
} from "../../services/order.service.js";

import "./checkout-page.css";

function formatPrice(value) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function getVariantDescription(variant) {
  if (!variant) return "";

  if (variant.attributes && typeof variant.attributes === "object") {
    const values = Object.entries(variant.attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");

    if (values) return values;
  }

  return variant.name || variant.sku || "";
}

function getOrderId(order) {
  return order?.id || order?.orderId || order?.order?.id || null;
}

function getOrderNumber(order) {
  return (
    order?.orderNumber ||
    order?.order?.orderNumber ||
    order?.code ||
    ""
  );
}

function getVoucherErrorMessage(error) {
  const messages = {
    VOUCHER_NOT_FOUND: "Mã giảm giá không tồn tại.",
    VOUCHER_INACTIVE: "Mã giảm giá hiện không hoạt động.",
    VOUCHER_OUTSIDE_VALID_PERIOD:
      "Mã giảm giá chưa bắt đầu hoặc đã hết hạn.",
    VOUCHER_MIN_ORDER_AMOUNT_NOT_MET:
      "Đơn hàng chưa đạt giá trị tối thiểu để sử dụng mã.",
    VOUCHER_USAGE_LIMIT_REACHED:
      "Mã giảm giá đã hết lượt sử dụng.",
    VOUCHER_USER_LIMIT_REACHED:
      "Bạn đã sử dụng hết số lần cho phép của mã này.",
    INSUFFICIENT_STOCK:
      "Sản phẩm không đủ tồn kho để thanh toán.",
    CART_ITEM_NOT_FOUND_OR_NOT_OWNED:
      "Sản phẩm đã chọn không còn hợp lệ trong giỏ hàng.",
    PRODUCT_NOT_AVAILABLE:
      "Một sản phẩm đã chọn hiện không còn kinh doanh.",
    PRODUCT_VARIANT_INACTIVE:
      "Một phân loại sản phẩm đã chọn hiện không còn hoạt động.",
  };

  return (
    messages[error?.code] ||
    error?.message ||
    "Không thể áp dụng mã giảm giá."
  );
}

export default function CheckoutPage({
  accessToken,
  selectedCartItemIds = [],
  buyNowItem = null,
  onNavigate,
  onSessionRefresh,
  onSessionExpired,
  onCartChange,
  onOrderCreated,
}) {
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");

  const [voucherCode, setVoucherCode] = useState("");
  const [voucherApplying, setVoucherApplying] = useState(false);
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherError, setVoucherError] = useState("");
  const [voucherSuccess, setVoucherSuccess] = useState("");

  const [customerNote, setCustomerNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOrder, setSuccessOrder] = useState(null);

  const selectedIdSet = useMemo(
    () => new Set(selectedCartItemIds),
    [selectedCartItemIds]
  );

  const selectedItems = useMemo(
    () =>
      (cart?.items || []).filter((item) =>
        selectedIdSet.has(item.id)
      ),
    [cart, selectedIdSet]
  );

  const isBuyNow = Boolean(
    buyNowItem?.variantId &&
    Number.isInteger(buyNowItem?.quantity) &&
    buyNowItem.quantity > 0
  );

  // Dữ liệu Buy Now chỉ dùng để hiển thị.
  // Backend sẽ tự truy vấn giá và tồn kho theo variantId.
  const checkoutItems = useMemo(() => {
    if (!isBuyNow) return selectedItems;

    const unitPrice = Number(buyNowItem.product?.price || 0);

    return [
      {
        id: buyNowItem.variantId,
        quantity: buyNowItem.quantity,
        lineTotal: unitPrice * buyNowItem.quantity,
        product: buyNowItem.product || {},
        variant: buyNowItem.variant || {},
      },
    ];
  }, [isBuyNow, buyNowItem, selectedItems]);

  const subtotal = checkoutItems.reduce(
    (total, item) => total + Number(item.lineTotal || 0),
    0
  );

  const selectedAddress = addresses.find(
    (address) => address.id === selectedAddressId
  );

  const requestContext = useMemo(
    () => ({
      accessToken,
      onSessionRefresh,
      onSessionExpired,
    }),
    [accessToken, onSessionRefresh, onSessionExpired]
  );

  // Voucher preview chỉ có hiệu lực với đúng danh sách sản phẩm đã kiểm tra.
  const selectedCartItemIdsKey = selectedCartItemIds.join("|");

  const [redirectingToPayment, setRedirectingToPayment] = useState(false);

  useEffect(() => {
    setVoucherResult(null);
    setVoucherError("");
    setVoucherSuccess("");
  }, [selectedCartItemIdsKey]);

  const discountAmount = voucherResult?.valid
    ? Math.min(
      subtotal,
      Math.max(0, Number(voucherResult.discountAmount) || 0)
    )
    : 0;

  const shippingFee = voucherResult?.valid
    ? Math.max(0, Number(voucherResult.shippingFee) || 0)
    : 0;

  const totalAmount = Math.max(
    0,
    subtotal - discountAmount + shippingFee
  );

  const loadCheckoutData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [cartResult, addressResult] = await Promise.all([
        isBuyNow
          ? Promise.resolve(null)
          : getCustomerCart(accessToken),
        getMyAddresses(requestContext),
      ]);

      const nextAddresses = Array.isArray(addressResult)
        ? addressResult
        : [];

      setAddresses(nextAddresses);

      if (!isBuyNow) {
        const nextCart = cartResult || null;
        setCart(nextCart);
        onCartChange?.(nextCart);
      }

      setSelectedAddressId((current) => {
        if (
          current &&
          nextAddresses.some((address) => address.id === current)
        ) {
          return current;
        }

        return (
          nextAddresses.find((address) => address.isDefault)?.id ||
          nextAddresses[0]?.id ||
          ""
        );
      });
    } catch (loadError) {
      setError(
        loadError.message || "Không thể tải dữ liệu thanh toán."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, requestContext, onCartChange, isBuyNow]);

  useEffect(() => {
    loadCheckoutData();
  }, [loadCheckoutData]);

  function handleVoucherCodeChange(event) {
    setVoucherCode(event.target.value);
    setVoucherResult(null);
    setVoucherError("");
    setVoucherSuccess("");
  }

  async function handleApplyVoucher() {
    if (voucherApplying || submitting) return;

    const code = voucherCode.trim().toUpperCase();

    if (!code) {
      setVoucherResult(null);
      setVoucherSuccess("");
      setVoucherError("Vui lòng nhập mã giảm giá.");
      return;
    }

    if (
      !selectedCartItemIds.length ||
      !selectedItems.length ||
      selectedItems.length !== selectedCartItemIds.length
    ) {
      setVoucherResult(null);
      setVoucherSuccess("");
      setVoucherError(
        "Danh sách sản phẩm thanh toán không còn hợp lệ. Vui lòng tải lại giỏ hàng."
      );
      return;
    }

    setVoucherApplying(true);
    setVoucherResult(null);
    setVoucherError("");
    setVoucherSuccess("");

    try {
      const result = await validateMemberVoucher({
        payload: {
          code,
          selectedCartItemIds,
        },
        ...requestContext,
      });

      if (!result?.valid) {
        throw new Error("Mã giảm giá không hợp lệ.");
      }

      setVoucherCode(result.code || code);
      setVoucherResult(result);
      setVoucherSuccess("Áp dụng mã giảm giá thành công.");
    } catch (applyError) {
      setVoucherResult(null);
      setVoucherError(getVoucherErrorMessage(applyError));
    } finally {
      setVoucherApplying(false);
    }
  }


  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting || voucherApplying) return;

    setError("");

    if (isBuyNow) {
      if (!buyNowItem?.variantId || !buyNowItem?.quantity) {
        setError("Thông tin sản phẩm Mua ngay không hợp lệ.");
        return;
      }
    } else {
      if (!selectedCartItemIds.length) {
        setError("Bạn chưa chọn sản phẩm để thanh toán.");
        return;
      }

      if (!selectedItems.length) {
        setError(
          "Các sản phẩm đã chọn không còn trong giỏ hàng. Vui lòng quay lại giỏ hàng."
        );
        return;
      }

      if (selectedItems.length !== selectedCartItemIds.length) {
        setError(
          "Giỏ hàng đã thay đổi. Vui lòng quay lại giỏ hàng và chọn lại sản phẩm."
        );
        return;
      }
    }

    if (!selectedAddress) {
      setError(
        "Bạn cần có ít nhất một địa chỉ nhận hàng trong Sổ địa chỉ."
      );
      return;
    }

    setSubmitting(true);

    try {
      const shippingPayload = {
        paymentMethod,
        shippingRecipientName: selectedAddress.recipientName,
        shippingPhone: selectedAddress.phone,
        shippingProvinceCity: selectedAddress.provinceCity,
        shippingDistrict: selectedAddress.district,
        shippingStreet: selectedAddress.street,
        shippingAddressNote: selectedAddress.addressNote || null,
        customerNote: customerNote.trim() || null,
      };

      let order;

      if (isBuyNow) {
        order = await createMemberBuyNowOrder({
          payload: {
            variantId: buyNowItem.variantId,
            quantity: buyNowItem.quantity,
            ...shippingPayload,
          },
          ...requestContext,
        });
      } else {
        const payload = {
          selectedCartItemIds,
          ...shippingPayload,
        };

        const normalizedVoucherCode = voucherCode.trim().toUpperCase();

        if (
          voucherResult?.valid &&
          voucherResult.code?.toUpperCase() === normalizedVoucherCode
        ) {
          payload.voucherCode = voucherResult.code;
        }

        order = await createMemberOrder({
          payload,
          ...requestContext,
        });
      }

      const orderId = getOrderId(order);

      if (!orderId) {
        throw new Error(
          "Đơn hàng đã được gửi nhưng không nhận được mã đơn hàng từ máy chủ."
        );
      }

      if (paymentMethod === "VNPAY") {
        setRedirectingToPayment(true);

        const checkout = await startMemberCheckout({
          orderId,
          ...requestContext,
        });

        if (!checkout?.paymentUrl) {
          throw new Error(
            "Không nhận được đường dẫn thanh toán VNPAY."
          );
        }

        onOrderCreated?.(order);
        window.location.assign(checkout.paymentUrl);
        return;
      }

      onOrderCreated?.(order);
      setSuccessOrder(order);

      // Chỉ tải lại giỏ hàng sau khi đặt hàng từ Cart.
      if (!isBuyNow) {
        const refreshedCart = await getCustomerCart(accessToken).catch(
          () => null
        );

        if (refreshedCart) {
          setCart(refreshedCart);
          onCartChange?.(refreshedCart);
        }
      }
    } catch (submitError) {
      setRedirectingToPayment(false);
      setError(
        submitError.message || "Không thể tạo đơn hàng. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  }


  if (loading) {
    return (
      <main className="checkout-page">
        <div className="checkout-state">
          Đang tải thông tin thanh toán...
        </div>
      </main>
    );
  }

  if (successOrder) {
    return (
      <main className="checkout-page">
        <section className="checkout-success">
          <div className="checkout-success__icon">✓</div>
          <p className="checkout-eyebrow">ORDER RECEIVED</p>
          <h1>Đặt hàng thành công!</h1>
          <p>
            Đơn hàng COD của bạn đã được ghi nhận. Bạn có thể tiếp tục mua
            sắm hoặc theo dõi đơn hàng trong tài khoản.
          </p>

          {getOrderNumber(successOrder) && (
            <div className="checkout-success__number">
              Mã đơn hàng: <strong>{getOrderNumber(successOrder)}</strong>
            </div>
          )}

          <div className="checkout-success__actions">
            <button
              type="button"
              onClick={() => onNavigate("/")}
            >
              Tiếp tục mua sắm
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onNavigate("/account")}
            >
              Về tài khoản
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (redirectingToPayment) {
    return (
      <main className="checkout-page">
        <section className="checkout-state">
          <h1>Đang chuyển hướng tới trang thanh toán</h1>
          <p>
            Đơn hàng của bạn đã được tạo thành công.
            Vui lòng chờ trong giây lát, hệ thống đang kết nối tới
            cổng thanh toán VNPAY.
          </p>
        </section>
      </main>
    );
  }

  if (!isBuyNow && !selectedCartItemIds.length) {
    return (
      <main className="checkout-page">
        <section className="checkout-empty">
          <h1>Chưa có sản phẩm thanh toán</h1>
          <p>Vui lòng quay lại giỏ hàng và chọn sản phẩm muốn đặt mua.</p>
          <button type="button" onClick={() => onNavigate("/cart")}>
            Quay lại giỏ hàng
          </button>
        </section>
      </main>
    );
  }

  if (!isBuyNow && !selectedItems.length) {
    return (
      <main className="checkout-page">
        <section className="checkout-empty">
          <h1>Không tìm thấy sản phẩm đã chọn</h1>
          <p>
            Giỏ hàng có thể đã thay đổi sau khi bạn chuyển sang thanh toán.
            Vui lòng chọn lại sản phẩm.
          </p>
          <button type="button" onClick={() => onNavigate("/cart")}>
            Quay lại giỏ hàng
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="checkout-container">
        <header className="checkout-heading">
          <div>
            <p className="checkout-eyebrow">SECURE CHECKOUT</p>
            <h1>Thanh toán</h1>
            <p>Kiểm tra đơn hàng và thông tin nhận hàng của bạn.</p>
          </div>

          <button
            type="button"
            className="checkout-back"
            onClick={() => onNavigate(isBuyNow ? "/" : "/cart")}
          >
            ← {isBuyNow ? "Tiếp tục mua sắm" : "Quay lại giỏ hàng"}
          </button>
        </header>

        {error && (
          <div className="checkout-alert" role="alert">
            {error}
          </div>
        )}

        <form className="checkout-layout" onSubmit={handleSubmit}>
          <div className="checkout-main">
            <section className="checkout-panel">
              <div className="checkout-panel__heading">
                <span className="checkout-step">01</span>
                <div>
                  <h2>Địa chỉ nhận hàng</h2>
                  <p>Chọn địa chỉ đã lưu trong sổ địa chỉ.</p>
                </div>
              </div>

              {addresses.length === 0 ? (
                <div className="checkout-no-address">
                  <p>
                    Bạn chưa lưu địa chỉ nhận hàng. Hãy thêm địa chỉ trong
                    phần Sổ địa chỉ trước khi đặt hàng.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("/account")}
                  >
                    Mở sổ địa chỉ
                  </button>
                </div>
              ) : (
                <div className="checkout-address-list">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`checkout-address ${selectedAddressId === address.id
                        ? "checkout-address--selected"
                        : ""
                        }`}
                    >
                      <input
                        type="radio"
                        name="shippingAddress"
                        value={address.id}
                        checked={selectedAddressId === address.id}
                        onChange={() =>
                          setSelectedAddressId(address.id)
                        }
                      />

                      <span className="checkout-address__content">
                        <span className="checkout-address__top">
                          <strong>{address.recipientName}</strong>
                          {address.isDefault && (
                            <span className="checkout-default-tag">
                              Mặc định
                            </span>
                          )}
                        </span>

                        <span>{address.phone}</span>
                        <span>
                          {address.street}, {address.district},{" "}
                          {address.provinceCity}
                        </span>

                        {address.addressNote && (
                          <span className="checkout-address__note">
                            {address.addressNote}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="checkout-manage-address"
                onClick={() => onNavigate("/account")}
              >
                Quản lý sổ địa chỉ →
              </button>
            </section>

            <section className="checkout-panel">
              <div className="checkout-panel__heading">
                <span className="checkout-step">02</span>
                <div>
                  <h2>Phương thức thanh toán</h2>
                  <p>Chọn cách thanh toán cho đơn hàng.</p>
                </div>
              </div>

              <div className="checkout-payment-options">
                <label
                  className={`checkout-payment-option ${paymentMethod === "COD"
                    ? "checkout-payment-option--selected"
                    : ""
                    }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                  />
                  <span>
                    <strong>Thanh toán khi nhận hàng (COD)</strong>
                    <small>
                      Thanh toán trực tiếp khi nhận được sản phẩm.
                    </small>
                  </span>
                </label>

                <label
                  className={`checkout-payment-option ${paymentMethod === "VNPAY"
                    ? "checkout-payment-option--selected"
                    : ""
                    }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="VNPAY"
                    checked={paymentMethod === "VNPAY"}
                    onChange={() => setPaymentMethod("VNPAY")}
                  />
                  <span>
                    <strong>Thanh toán qua VNPAY</strong>
                    <small>
                      Chuyển đến cổng VNPAY sau khi xác nhận đơn hàng.
                    </small>
                  </span>
                </label>
              </div>
            </section>

            {!isBuyNow && (
              <section className="checkout-panel">
                <section className="checkout-panel">
                  <div className="checkout-panel__heading">
                    <span className="checkout-step">03</span>
                    <div>
                      <h2>Ưu đãi và ghi chú</h2>
                      <p>Thông tin bổ sung cho đơn hàng của bạn.</p>
                    </div>
                  </div>

                  <div className="checkout-field">
                    <label htmlFor="checkout-voucher">Mã giảm giá</label>

                    <div className="checkout-voucher-input">
                      <input
                        id="checkout-voucher"
                        type="text"
                        value={voucherCode}
                        onChange={handleVoucherCodeChange}
                        maxLength={50}
                        placeholder="Nhập mã voucher"
                        disabled={voucherApplying || submitting}
                      />

                      <button
                        type="button"
                        onClick={handleApplyVoucher}
                        disabled={
                          voucherApplying ||
                          submitting ||
                          !voucherCode.trim() ||
                          !selectedItems.length
                        }
                      >
                        {voucherApplying ? "ĐANG KIỂM TRA..." : "ÁP DỤNG"}
                      </button>
                    </div>

                    {voucherError && (
                      <small
                        className="checkout-voucher-error"
                        role="alert"
                      >
                        {voucherError}
                      </small>
                    )}

                    {voucherSuccess && (
                      <small
                        className="checkout-voucher-success"
                        role="status"
                      >
                        {voucherSuccess}
                      </small>
                    )}

                    {voucherResult && (
                      <small className="checkout-voucher-applied">
                        Đã áp dụng mã <strong>{voucherResult.code}</strong>.
                      </small>
                    )}
                  </div>

                  <div className="checkout-field">
                    <label htmlFor="checkout-note">Ghi chú đơn hàng</label>
                    <textarea
                      id="checkout-note"
                      value={customerNote}
                      onChange={(event) =>
                        setCustomerNote(event.target.value)
                      }
                      maxLength={2000}
                      rows={4}
                      placeholder="Lưu ý khi giao hàng (không bắt buộc)"
                    />
                  </div>
                </section>
              </section>)}
          </div>

          <aside className="checkout-summary">
            <h2>Đơn hàng của bạn</h2>

            <div className="checkout-summary__items">
              {checkoutItems.map((item) => {
                const product = item.product || {};
                const variant = item.variant || {};
                const image = Array.isArray(product.images)
                  ? product.images[0]
                  : null;

                return (
                  <div className="checkout-summary-item" key={item.id}>
                    <div className="checkout-summary-item__image">
                      {image?.imageUrl ? (
                        <img
                          src={image.imageUrl}
                          alt={image.altText || product.name || "Sản phẩm"}
                        />
                      ) : (
                        <span>Q</span>
                      )}
                      <small>{item.quantity}</small>
                    </div>

                    <div className="checkout-summary-item__info">
                      <strong>{product.name || "Sản phẩm"}</strong>
                      <span>{getVariantDescription(variant)}</span>
                      <b>{formatPrice(item.lineTotal)}</b>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="checkout-summary__row">
              <span>Số sản phẩm</span>
              <strong>
                {checkoutItems.reduce(
                  (total, item) => total + Number(item.quantity || 0),
                  0
                )}
              </strong>
            </div>

            <div className="checkout-summary__row">
              <span>Tạm tính</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>

            <div className="checkout-summary__row">
              <span>Giảm giá</span>
              <strong>
                {discountAmount > 0
                  ? `-${formatPrice(discountAmount)}`
                  : formatPrice(0)}
              </strong>
            </div>

            <div className="checkout-summary__row">
              <span>Phí vận chuyển</span>
              <strong>
                {shippingFee === 0
                  ? "Miễn phí"
                  : formatPrice(shippingFee)}
              </strong>
            </div>

            <div className="checkout-summary__total">
              <span>Tổng thanh toán</span>
              <strong>{formatPrice(totalAmount)}</strong>
            </div>

            <p className="checkout-summary__notice">
              Mã giảm giá và số tiền cuối cùng sẽ được máy chủ kiểm tra
              lại khi tạo đơn hàng.
            </p>

            <button
              type="submit"
              className="checkout-submit"
              disabled={
                submitting ||
                voucherApplying ||
                !selectedAddress ||
                addresses.length === 0
              }
            >
              {submitting
                ? "ĐANG XỬ LÝ..."
                : paymentMethod === "VNPAY"
                  ? "XÁC NHẬN & THANH TOÁN VNPAY"
                  : "ĐẶT HÀNG"}
            </button>

            <p className="checkout-secure-note">
              Thông tin đơn hàng được xác thực bởi máy chủ Lan Anh Sport.
            </p>
          </aside>
        </form>
      </div>
    </main>
  );
}
