import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMyAddresses,
  createMyAddress,
  updateMyAddress,
  setMyDefaultAddress,
  deleteMyAddress,
} from "../../services/address.service.js";

import provincesData from "../../data/vietnam-provinces.json";
import wardsData from "../../data/vietnam-wards.json";

import "./address-book.css";

const PROVINCES = provincesData.dong || [];
const WARDS = wardsData.dong || [];

const EMPTY_FORM = {
  recipientName: "",
  phone: "",
  provinceCity: "",
  ward: "",
  street: "",
  addressNote: "",
  isDefault: false,
};

const ERROR_MESSAGES = {
  ADDRESS_LIMIT_REACHED: "Bạn chỉ có thể lưu tối đa 5 địa chỉ.",
  ADDRESS_NOT_FOUND: "Không tìm thấy địa chỉ hoặc địa chỉ đã bị xóa.",
  ADDRESS_CONCURRENT_UPDATE:
    "Địa chỉ vừa được thay đổi bởi một yêu cầu khác. Vui lòng tải lại và thử lại.",
  VALIDATION_ERROR: "Thông tin địa chỉ chưa hợp lệ. Vui lòng kiểm tra lại.",
};

function getErrorMessage(error) {
  return (
    ERROR_MESSAGES[error.code] ||
    error.message ||
    "Đã xảy ra lỗi. Vui lòng thử lại."
  );
}

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function SearchableAddressSelect({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  onChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const selectedOption = options.find(
    (option) => option.value === value
  );

  const normalizedSearch = normalizeSearch(search);

  const filteredOptions = options
    .filter((option) =>
      normalizeSearch(option.label).includes(normalizedSearch)
    )
    .slice(0, 80);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  function handleSelect(option) {
    onChange(option.value);
    setSearch("");
    setIsOpen(false);
  }

  return (
    <div
      className={`address-book-select ${isOpen ? "is-open" : ""
        }`}
      ref={containerRef}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        autoComplete="off"
        value={isOpen ? search : selectedOption?.label || ""}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setIsOpen(true);
          setSearch("");
        }}
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            setSearch("");
          }
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setSearch("");
          }
        }}
        className="address-book-select-input"
      />

      <span className="address-book-select-arrow" aria-hidden="true">
        {isOpen ? "⌃" : "⌄"}
      </span>

      {isOpen && !disabled && (
        <div
          id={`${id}-options`}
          className="address-book-select-options"
          role="listbox"
        >
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`address-book-select-option ${option.value === value ? "is-selected" : ""
                    }`}
                  onClick={() => handleSelect(option)}
                >
                  {option.label}
                </button>
              ))}

              {filteredOptions.length === 80 && (
                <p className="address-book-select-hint">
                  Đang hiển thị tối đa 80 kết quả. Hãy nhập thêm từ khóa để tìm chính xác hơn.
                </p>
              )}
            </>
          ) : (
            <p className="address-book-select-empty">
              Không tìm thấy kết quả phù hợp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddressForm({
  initialValue,
  isEditing,
  loading,
  onSubmit,
  onCancel,
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...initialValue,
    ward: initialValue?.district || initialValue?.ward || "",
  }));

  function handleChange(event) {
    const { name, value, checked, type } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      provinceCity: form.provinceCity.trim(),

      // Tạm giữ tên district để tương thích API hiện tại.
      // Giá trị thực tế là tên phường/xã/đặc khu.
      district: form.ward.trim(),

      street: form.street.trim(),
      addressNote: form.addressNote.trim() || null,
    };

    if (!isEditing) {
      payload.isDefault = form.isDefault;
    }

    onSubmit(payload);
  }

  return (
    <form className="address-book-form" onSubmit={handleSubmit}>
      <div className="address-book-form-heading">
        <div>
          <span className="address-book-eyebrow">
            {isEditing ? "EDIT ADDRESS" : "NEW ADDRESS"}
          </span>

          <h3>{isEditing ? "Cập nhật địa chỉ" : "Thêm địa chỉ mới"}</h3>

          <p>
            Nhập chính xác thông tin người nhận và địa chỉ giao hàng.
          </p>
        </div>
      </div>

      <div className="address-book-fields">
        <div className="address-book-field">
          <label htmlFor="address-recipient">
            Họ tên người nhận <span>*</span>
          </label>

          <input
            id="address-recipient"
            name="recipientName"
            value={form.recipientName}
            onChange={handleChange}
            maxLength={150}
            autoComplete="name"
            required
            disabled={loading}
            placeholder="Nguyễn Văn A"
          />
        </div>

        <div className="address-book-field">
          <label htmlFor="address-phone">
            Số điện thoại <span>*</span>
          </label>

          <input
            id="address-phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            maxLength={20}
            autoComplete="tel"
            required
            disabled={loading}
            placeholder="09xxxxxxxx"
          />
        </div>

        <div className="address-book-field">
          <label htmlFor="address-province">
            Tỉnh / Thành phố <span>*</span>
          </label>

          <SearchableAddressSelect
            id="address-province"
            value={form.provinceCity}
            placeholder="Chọn tỉnh / thành phố"
            searchPlaceholder="Tìm tỉnh / thành phố"
            disabled={loading}
            options={PROVINCES.map((province) => ({
              value: province.ten_day_du,
              label: province.ten_day_du,
            }))}
            onChange={(value) => {
              setForm((current) => ({
                ...current,
                provinceCity: value,
                ward: "",
              }));
            }}
          />
        </div>

        <div className="address-book-field">
          <label htmlFor="address-ward">
            Phường / Xã / Đặc khu <span>*</span>
          </label>

          {(() => {
            const selectedProvince = PROVINCES.find(
              (province) =>
                province.ten_day_du === form.provinceCity
            );

            const wardOptions = selectedProvince
              ? WARDS
                .filter(
                  (ward) => ward.ma_tinh === selectedProvince.ma_tinh
                )
                .map((ward) => ({
                  value: ward.ten,
                  label: ward.ten,
                }))
              : [];

            return (
              <SearchableAddressSelect
                id="address-ward"
                value={form.ward}
                placeholder={
                  selectedProvince
                    ? "Chọn phường / xã"
                    : "Vui lòng chọn tỉnh / thành phố trước"
                }
                searchPlaceholder="Tìm phường / xã"
                disabled={loading || !selectedProvince}
                options={wardOptions}
                onChange={(value) => {
                  setForm((current) => ({
                    ...current,
                    ward: value,
                  }));
                }}
              />
            );
          })()}
        </div>

        <div className="address-book-field address-book-field-full">
          <label htmlFor="address-street">
            Địa chỉ cụ thể <span>*</span>
          </label>

          <input
            id="address-street"
            name="street"
            value={form.street}
            onChange={handleChange}
            maxLength={255}
            autoComplete="street-address"
            required
            disabled={loading}
            placeholder="Số nhà, tên đường, ngõ, thôn / xóm..."
          />
        </div>

        <div className="address-book-field address-book-field-full">
          <label htmlFor="address-note">
            Ghi chú giao hàng
          </label>

          <textarea
            id="address-note"
            name="addressNote"
            value={form.addressNote || ""}
            onChange={handleChange}
            maxLength={500}
            rows={3}
            disabled={loading}
            placeholder="Ví dụ: Gọi trước khi giao, giao giờ hành chính..."
          />
        </div>
      </div>

      {!isEditing && (
        <label className="address-book-default-option">
          <input
            type="checkbox"
            name="isDefault"
            checked={form.isDefault}
            onChange={handleChange}
            disabled={loading}
          />

          <span>Đặt làm địa chỉ mặc định</span>
        </label>
      )}

      <div className="address-book-form-actions">
        <button
          type="button"
          className="address-book-button address-book-button-secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Hủy
        </button>

        <button
          type="submit"
          className="address-book-button address-book-button-primary"
          disabled={loading}
        >
          {loading
            ? "Đang lưu..."
            : isEditing
              ? "Lưu thay đổi"
              : "Thêm địa chỉ"}
        </button>
      </div>
    </form>
  );
}

function AddressCard({
  address,
  loading,
  onEdit,
  onDelete,
  onSetDefault,
}) {
  return (
    <article
      className={`address-book-card ${address.isDefault ? "is-default" : ""
        }`}
    >
      <div className="address-book-card-top">
        <div className="address-book-recipient">
          <strong>{address.recipientName}</strong>

          {address.isDefault && (
            <span className="address-book-default-badge">
              MẶC ĐỊNH
            </span>
          )}
        </div>

        <span className="address-book-card-phone">
          {address.phone}
        </span>
      </div>

      <div className="address-book-card-body">
        <p>
          {address.street}
        </p>

        <p>
          {address.district}, {address.provinceCity}
        </p>

        {address.addressNote && (
          <p className="address-book-card-note">
            Ghi chú: {address.addressNote}
          </p>
        )}
      </div>

      <div className="address-book-card-actions">
        {!address.isDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(address.id)}
            disabled={loading}
          >
            Đặt mặc định
          </button>
        )}

        <button
          type="button"
          onClick={() => onEdit(address)}
          disabled={loading}
        >
          Chỉnh sửa
        </button>

        <button
          type="button"
          className="address-book-delete-action"
          onClick={() => onDelete(address)}
          disabled={loading}
        >
          Xóa
        </button>
      </div>
    </article>
  );
}

export default function AddressBook({
  accessToken,
  onSessionRefresh,
  onSessionExpired,
}) {
  const [addresses, setAddresses] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formMode, setFormMode] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deletingAddress, setDeletingAddress] = useState(null);

  const requestContext = {
    accessToken,
    onSessionRefresh,
    onSessionExpired,
  };

  const loadAddresses = useCallback(async () => {
    setError("");

    try {
      const result = await getMyAddresses(requestContext);
      setAddresses(Array.isArray(result) ? result : []);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setInitialLoading(false);
    }
  }, [accessToken, onSessionRefresh, onSessionExpired]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  function openCreateForm() {
    setError("");
    setSuccess("");
    setEditingAddress(null);
    setFormMode("create");
  }

  function openEditForm(address) {
    setError("");
    setSuccess("");
    setEditingAddress(address);
    setFormMode("edit");
  }

  function closeForm() {
    if (actionLoading) return;

    setFormMode(null);
    setEditingAddress(null);
  }

  async function handleSubmit(payload) {
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      if (formMode === "edit" && editingAddress) {
        await updateMyAddress(
          editingAddress.id,
          payload,
          requestContext
        );

        setSuccess("Cập nhật địa chỉ thành công.");
      } else {
        await createMyAddress(payload, requestContext);
        setSuccess("Thêm địa chỉ mới thành công.");
      }

      setFormMode(null);
      setEditingAddress(null);
      await loadAddresses();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSetDefault(addressId) {
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await setMyDefaultAddress(addressId, requestContext);
      setSuccess("Đã cập nhật địa chỉ mặc định.");
      await loadAddresses();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingAddress) return;

    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await deleteMyAddress(deletingAddress.id, requestContext);

      setDeletingAddress(null);
      setSuccess("Đã xóa địa chỉ.");

      await loadAddresses();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <section className="address-book-page">
      <div className="member-content-heading address-book-heading">
        <div>
          <span className="member-section-eyebrow">
            DELIVERY SETTINGS
          </span>

          <h2>Sổ địa chỉ</h2>

          <p>
            Quản lý địa chỉ nhận hàng cho các đơn hàng QMD SPORT.
          </p>
        </div>

        <span className="member-section-count">
          ADDRESS / 01
        </span>
      </div>

      <div className="address-book-summary">
        <div className="address-book-summary-icon" aria-hidden="true">
          ⌖
        </div>

        <div className="address-book-summary-copy">
          <strong>Địa chỉ giao hàng của bạn</strong>
          <p>
            Bạn có thể lưu tối đa 5 địa chỉ và chọn một địa chỉ mặc định.
          </p>
        </div>

        <span className="address-book-count">
          {addresses.length} / 5
        </span>
      </div>

      {error && (
        <div className="address-book-alert address-book-alert-error" role="alert">
          <span>{error}</span>

          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="address-book-alert address-book-alert-success" role="status">
          <span>{success}</span>

          <button type="button" onClick={() => setSuccess("")}>
            ×
          </button>
        </div>
      )}

      {formMode ? (
        <AddressForm
          key={`${formMode}-${editingAddress?.id || "new"}`}
          initialValue={editingAddress || EMPTY_FORM}
          isEditing={formMode === "edit"}
          loading={actionLoading}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      ) : (
        <div className="address-book-list-heading">
          <div>
            <h3>Danh sách địa chỉ</h3>
            <p>
              Địa chỉ mặc định sẽ được ưu tiên khi đặt hàng.
            </p>
          </div>

          <button
            type="button"
            className="address-book-button address-book-button-primary"
            onClick={openCreateForm}
            disabled={addresses.length >= 5 || initialLoading}
          >
            <span aria-hidden="true">+</span>
            Thêm địa chỉ
          </button>
        </div>
      )}

      {initialLoading ? (
        <div className="address-book-state">
          <span className="address-book-spinner" />
          <p>Đang tải danh sách địa chỉ...</p>
        </div>
      ) : addresses.length === 0 && !formMode ? (
        <div className="address-book-empty">
          <div aria-hidden="true">⌖</div>
          <h3>Bạn chưa có địa chỉ giao hàng</h3>
          <p>
            Thêm địa chỉ đầu tiên để thuận tiện hơn trong quá trình đặt hàng.
          </p>

          <button
            type="button"
            className="address-book-button address-book-button-primary"
            onClick={openCreateForm}
          >
            Thêm địa chỉ đầu tiên
          </button>
        </div>
      ) : !formMode ? (
        <div className="address-book-list">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              loading={actionLoading}
              onEdit={openEditForm}
              onDelete={setDeletingAddress}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      ) : null}

      {addresses.length >= 5 && !formMode && (
        <p className="address-book-limit-note">
          Bạn đã đạt giới hạn 5 địa chỉ. Hãy xóa một địa chỉ cũ nếu muốn thêm địa chỉ mới.
        </p>
      )}

      {deletingAddress && (
        <div
          className="address-book-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionLoading) {
              setDeletingAddress(null);
            }
          }}
        >
          <section
            className="address-book-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-delete-title"
          >
            <div className="address-book-confirm-icon">!</div>

            <h3 id="address-delete-title">Xóa địa chỉ này?</h3>

            <p>
              Bạn có chắc muốn xóa địa chỉ của{" "}
              <strong>{deletingAddress.recipientName}</strong> không?
            </p>

            {deletingAddress.isDefault && addresses.length > 1 && (
              <p className="address-book-confirm-note">
                Một địa chỉ khác sẽ được tự động chọn làm mặc định.
              </p>
            )}

            {deletingAddress.isDefault && addresses.length === 1 && (
              <p className="address-book-confirm-note">
                Sau khi xóa, tài khoản sẽ không còn địa chỉ mặc định.
              </p>
            )}

            <div className="address-book-confirm-actions">
              <button
                type="button"
                className="address-book-button address-book-button-secondary"
                onClick={() => setDeletingAddress(null)}
                disabled={actionLoading}
              >
                Giữ lại
              </button>

              <button
                type="button"
                className="address-book-button address-book-button-danger"
                onClick={handleDelete}
                disabled={actionLoading}
              >
                {actionLoading ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}