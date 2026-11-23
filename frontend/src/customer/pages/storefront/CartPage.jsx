
import { useCallback, useEffect, useState } from "react";
import {
    getCustomerCart,
    updateCustomerCartItem,
    removeCustomerCartItem,
    clearCustomerCart,
} from "../../services/cart.service";
import "./cart-page.css";

function formatPrice(value) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);
}

function getVariantDescription(variant) {
    if (!variant) return "";

    const attributes = variant.attributes;

    if (attributes && typeof attributes === "object") {
        const values = Object.entries(attributes)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" · ");

        if (values) return values;
    }

    return variant.name || variant.sku || "";
}

export default function CartPage({
    accessToken,
    onNavigate,
    onSessionRefresh,
    onSessionExpired,
    onCartChange,
    onCheckout,
}) {
    const [cart, setCart] = useState(null);
    const [loading, setLoading] = useState(true);

    // null: chưa khởi tạo lựa chọn lần đầu.
    // []: người dùng đã chủ động bỏ chọn tất cả.
    const [selectedItemIds, setSelectedItemIds] = useState(null);

    const [busyItemId, setBusyItemId] = useState(null);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const cartItems = cart?.items || [];
    const currentSelectedItemIds = selectedItemIds ?? [];

    const selectedItems = cartItems.filter((item) =>
        currentSelectedItemIds.includes(item.id)
    );

    const selectedTotalQuantity = selectedItems.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
    );

    const selectedSubtotal = selectedItems.reduce(
        (total, item) => total + Number(item.lineTotal || 0),
        0
    );

    const allSelected =
        cartItems.length > 0 &&
        cartItems.every((item) =>
            currentSelectedItemIds.includes(item.id)
        );

    const toggleItemSelection = (itemId) => {
        setSelectedItemIds((previous) => {
            const currentIds = previous ?? [];

            return currentIds.includes(itemId)
                ? currentIds.filter((id) => id !== itemId)
                : [...currentIds, itemId];
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedItemIds([]);
        } else {
            setSelectedItemIds(cartItems.map((item) => item.id));
        }
    };

    const publishCart = useCallback(
        (nextCart) => {
            const nextItems = nextCart?.items || [];
            const nextIds = nextItems.map((item) => item.id);

            setSelectedItemIds((previous) => {
                // Chỉ tự chọn tất cả trong lần tải giỏ hàng đầu tiên.
                if (previous === null) {
                    return nextIds;
                }

                // Giữ các lựa chọn còn tồn tại sau khi thêm, xóa
                // hoặc cập nhật sản phẩm trong giỏ hàng.
                return previous.filter((id) => nextIds.includes(id));
            });

            setCart(nextCart);
            onCartChange?.(nextCart);
        },
        [onCartChange]
    );

    const requestWithRefresh = useCallback(
        async (request) => {
            try {
                return await request(accessToken);
            } catch (err) {
                if (err.status !== 401 || !onSessionRefresh) {
                    if (err.status === 401) {
                        onSessionExpired?.();
                    }
                    throw err;
                }

                const nextSession = await onSessionRefresh();

                if (!nextSession?.accessToken) {
                    onSessionExpired?.();
                    throw err;
                }

                return request(nextSession.accessToken);
            }
        },
        [accessToken, onSessionRefresh, onSessionExpired]
    );

    const loadCart = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const result = await requestWithRefresh(getCustomerCart);
            publishCart(result);
        } catch (err) {
            setError(err.message || "Không thể tải giỏ hàng.");
        } finally {
            setLoading(false);
        }
    }, [publishCart, requestWithRefresh]);

    useEffect(() => {
        loadCart();
    }, [loadCart]);

    const handleQuantityChange = async (item, nextQuantity) => {
        const quantity = Number(nextQuantity);

        if (!Number.isInteger(quantity) || quantity < 1) return;

        const available = Number(item.availableQuantity) || 0;

        if (quantity > available) {
            setError(
                `Sản phẩm chỉ còn ${available} sản phẩm có thể đặt.`
            );
            return;
        }

        if (quantity === item.quantity) return;

        setBusyItemId(item.id);
        setError("");
        setNotice("");

        try {
            const result = await requestWithRefresh((token) =>
                updateCustomerCartItem({
                    accessToken: token,
                    itemId: item.id,
                    quantity,
                })
            );

            publishCart(result);
            setNotice("Đã cập nhật số lượng sản phẩm.");
        } catch (err) {
            setError(err.message || "Không thể cập nhật số lượng.");
        } finally {
            setBusyItemId(null);
        }
    };

    const handleRemoveItem = async (item) => {
        setBusyItemId(item.id);
        setError("");
        setNotice("");

        try {
            const result = await requestWithRefresh((token) =>
                removeCustomerCartItem({
                    accessToken: token,
                    itemId: item.id,
                })
            );

            publishCart(result);
            setNotice("Đã xóa sản phẩm khỏi giỏ hàng.");
        } catch (err) {
            setError(err.message || "Không thể xóa sản phẩm.");
        } finally {
            setBusyItemId(null);
        }
    };

    const handleClearCart = async () => {
        if (!cart?.items?.length) return;

        const confirmed = window.confirm(
            "Bạn có chắc chắn muốn xóa toàn bộ sản phẩm trong giỏ hàng?"
        );

        if (!confirmed) return;

        setClearing(true);
        setError("");
        setNotice("");

        try {
            const result = await requestWithRefresh(clearCustomerCart);
            publishCart(result);
            setNotice("Đã xóa toàn bộ giỏ hàng.");
        } catch (err) {
            setError(err.message || "Không thể xóa giỏ hàng.");
        } finally {
            setClearing(false);
        }
    };

    if (loading) {
        return (
            <main className="cart-page">
                <div className="cart-page__loading">
                    Đang tải giỏ hàng...
                </div>
            </main>
        );
    }

    const items = cart?.items || [];

    return (
        <main className="cart-page">
            <div className="cart-page__container">
                <div className="cart-page__heading">
                    <div>
                        <p className="cart-page__eyebrow">
                            YOUR SHOPPING CART
                        </p>
                        <h1>Giỏ hàng</h1>
                        <p>
                            {cart?.totalQuantity || 0} sản phẩm trong giỏ hàng
                        </p>
                    </div>

                    <button
                        type="button"
                        className="cart-page__continue"
                        onClick={() => onNavigate("/")}
                    >
                        ← Tiếp tục mua sắm
                    </button>
                </div>

                {error && (
                    <div className="cart-page__message cart-page__message--error">
                        {error}
                    </div>
                )}

                {notice && (
                    <div className="cart-page__message cart-page__message--success">
                        {notice}
                    </div>
                )}

                {items.length === 0 ? (
                    <section className="cart-page__empty">
                        <div className="cart-page__empty-icon">🛒</div>
                        <h2>Giỏ hàng đang trống</h2>
                        <p>
                            Hãy khám phá sản phẩm và thêm vào giỏ hàng nhé.
                        </p>
                        <button
                            type="button"
                            onClick={() => onNavigate("/")}
                            className="cart-page__primary-button"
                        >
                            Khám phá sản phẩm
                        </button>
                    </section>
                ) : (
                    <div className="cart-page__layout">
                        <section className="cart-page__items">
                            <div className="cart-page__items-header">
                                <h2>Sản phẩm của bạn</h2>

                                <button
                                    type="button"
                                    className="cart-page__clear"
                                    onClick={handleClearCart}
                                    disabled={clearing || Boolean(busyItemId)}
                                >
                                    {clearing ? "Đang xóa..." : "Xóa tất cả"}
                                </button>
                            </div>

                            <label className="cart-select-all">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleSelectAll}
                                    disabled={clearing}
                                />
                                <span>
                                    Chọn tất cả ({items.length} sản phẩm)
                                </span>
                            </label>

                            {items.map((item) => {
                                const product = item.product || {};
                                const variant = item.variant || {};
                                const isBusy = busyItemId === item.id;

                                const isSelected =
                                    currentSelectedItemIds.includes(item.id);

                                const available =
                                    Number(item.availableQuantity) || 0;

                                const outOfStock =
                                    !item.inStock || available < 1;

                                const primaryImage = Array.isArray(product.images)
                                    ? product.images[0]
                                    : null;

                                const imageUrl = primaryImage?.imageUrl;

                                return (
                                    <article
                                        className={`cart-item ${isSelected ? "cart-item--selected" : ""
                                            }`}
                                        key={item.id}
                                    >
                                        <div className="cart-item__selection">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() =>
                                                    toggleItemSelection(item.id)
                                                }
                                                disabled={clearing}
                                                aria-label={`Chọn ${product.name || "sản phẩm"
                                                    }`}
                                            />
                                        </div>

                                        <div className="cart-item__image">
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={
                                                        primaryImage?.altText ||
                                                        product.name ||
                                                        "Sản phẩm"
                                                    }
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <span>PRODUCT</span>
                                            )}
                                        </div>

                                        <div className="cart-item__details">
                                            <button
                                                type="button"
                                                className="cart-item__name"
                                                onClick={() =>
                                                    onNavigate(
                                                        `/products/${product.id}`
                                                    )
                                                }
                                            >
                                                {product.name || "Sản phẩm"}
                                            </button>

                                            <p className="cart-item__variant">
                                                {getVariantDescription(variant)}
                                            </p>

                                            {variant.sku && (
                                                <p className="cart-item__sku">
                                                    SKU: {variant.sku}
                                                </p>
                                            )}

                                            <p className="cart-item__unit-price">
                                                {formatPrice(product.price)}
                                            </p>

                                            {outOfStock && (
                                                <p className="cart-item__stock-warning">
                                                    Sản phẩm hiện không đủ tồn kho.
                                                </p>
                                            )}

                                            {!outOfStock &&
                                                available < item.quantity && (
                                                    <p className="cart-item__stock-warning">
                                                        Chỉ còn {available} sản phẩm có thể đặt.
                                                    </p>
                                                )}

                                            <button
                                                type="button"
                                                className="cart-item__remove"
                                                onClick={() =>
                                                    handleRemoveItem(item)
                                                }
                                                disabled={isBusy || clearing}
                                            >
                                                {isBusy
                                                    ? "Đang xử lý..."
                                                    : "Xóa"}
                                            </button>
                                        </div>

                                        <div className="cart-item__actions">
                                            <div className="cart-item__quantity">
                                                <button
                                                    type="button"
                                                    aria-label="Giảm số lượng"
                                                    disabled={
                                                        isBusy ||
                                                        clearing ||
                                                        item.quantity <= 1 ||
                                                        outOfStock
                                                    }
                                                    onClick={() =>
                                                        handleQuantityChange(
                                                            item,
                                                            item.quantity - 1
                                                        )
                                                    }
                                                >
                                                    −
                                                </button>

                                                <span>{item.quantity}</span>

                                                <button
                                                    type="button"
                                                    aria-label="Tăng số lượng"
                                                    disabled={
                                                        isBusy ||
                                                        clearing ||
                                                        outOfStock ||
                                                        item.quantity >= available
                                                    }
                                                    onClick={() =>
                                                        handleQuantityChange(
                                                            item,
                                                            item.quantity + 1
                                                        )
                                                    }
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <strong className="cart-item__line-total">
                                                {formatPrice(item.lineTotal)}
                                            </strong>
                                        </div>
                                    </article>
                                );
                            })}
                        </section>

                        <aside className="cart-summary">
                            <h2>Tóm tắt đơn hàng</h2>

                            <div className="cart-summary__row">
                                <span>Sản phẩm đã chọn</span>
                                <strong>
                                    {selectedItems.length}/{items.length}
                                </strong>
                            </div>

                            <div className="cart-summary__row">
                                <span>Tổng số lượng</span>
                                <strong>{selectedTotalQuantity}</strong>
                            </div>

                            <div className="cart-summary__row">
                                <span>Tạm tính</span>
                                <strong>
                                    {formatPrice(selectedSubtotal)}
                                </strong>
                            </div>

                            <div className="cart-summary__divider" />

                            <div className="cart-summary__total">
                                <span>Tổng cộng</span>
                                <strong>
                                    {formatPrice(selectedSubtotal)}
                                </strong>
                            </div>

                            <p className="cart-summary__note">
                                Phí vận chuyển và ưu đãi sẽ được tính ở bước
                                thanh toán.
                            </p>

                            <button
                                type="button"
                                className="cart-page__checkout-button"
                                disabled={
                                    selectedItems.length === 0 ||
                                    clearing ||
                                    Boolean(busyItemId)
                                }
                                onClick={() => {
                                    onCheckout?.(selectedItems.map((item) => item.id));
                                }}
                            >
                                Thanh toán ({selectedTotalQuantity})
                            </button>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
