
import { useState } from "react";
import { changeCustomerPassword } from "../../services/auth.service.js";

export default function ChangePasswordForm({
  accessToken,
  onSessionExpired,
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isChanged, setIsChanged] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    setIsSubmitting(true);

    try {
      await changeCustomerPassword({
        accessToken,
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsChanged(true);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Không thể đổi mật khẩu. Vui lòng thử lại."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChanged) {
    return (
      <div className="member-password-success" role="status">
        <div className="member-password-success-icon" aria-hidden="true">
          ✓
        </div>

        <div className="member-password-success-content">
          <strong>Đổi mật khẩu thành công</strong>
          <p>
            Vì lý do bảo mật, bạn cần đăng nhập lại bằng mật khẩu mới.
            Các phiên đăng nhập khác cũng đã bị thu hồi.
          </p>

          <button
            type="button"
            onClick={onSessionExpired}
            className="member-password-submit"
          >
            Đăng nhập lại <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="member-password-form" onSubmit={handleSubmit}>
      <div className="member-password-description">
        <div className="member-security-icon" aria-hidden="true">
          ◈
        </div>

        <div>
          <strong>Đổi mật khẩu</strong>
          <p>
            Nhập mật khẩu hiện tại và thiết lập mật khẩu mới cho tài khoản.
          </p>
        </div>
      </div>

      <div className="member-password-fields">
        <div className="member-password-field">
          <label htmlFor="currentPassword">
            Mật khẩu hiện tại
          </label>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="member-password-field">
          <label htmlFor="newPassword">
            Mật khẩu mới
          </label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
            disabled={isSubmitting}
          />
          <small>Mật khẩu phải có ít nhất 8 ký tự.</small>
        </div>

        <div className="member-password-field">
          <label htmlFor="confirmPassword">
            Xác nhận mật khẩu mới
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
            disabled={isSubmitting}
          />
        </div>
      </div>

      {error && (
        <p className="member-password-error" role="alert">
          {error}
        </p>
      )}

      <div className="member-password-actions">
        <button
          type="submit"
          className="member-password-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "ĐANG XỬ LÝ..." : "CẬP NHẬT MẬT KHẨU"}
        </button>
      </div>
    </form>
  );
}
