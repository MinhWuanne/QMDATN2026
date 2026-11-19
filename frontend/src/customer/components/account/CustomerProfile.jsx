
import ChangePasswordForm from "./ChangePasswordForm.jsx";

function getInitial(name) {
  return (name || "U").trim().charAt(0).toUpperCase();
}

function getMemberName(user) {
  return user?.fullName?.trim() || "Thành viên";
}

function MemberIdentity({ user }) {
  return (
    <div className="member-account-identity">
      <div className="member-account-avatar">
        {getInitial(user?.fullName)}
      </div>

      <div>
        <span>THÀNH VIÊN QMD SPORT</span>
        <h3>{getMemberName(user)}</h3>
        <small>Customer account</small>
      </div>
    </div>
  );
}

function MemberDetails({ user }) {
  return (
    <div className="member-account-details">
      <div className="member-detail">
        <span>ĐỊA CHỈ EMAIL</span>
        <strong>{user?.email || "Chưa cập nhật"}</strong>
      </div>

      <div className="member-detail">
        <span>SỐ ĐIỆN THOẠI</span>
        <strong>{user?.phone || "Chưa cập nhật"}</strong>
      </div>

      <div className="member-detail">
        <span>LOẠI TÀI KHOẢN</span>
        <strong>Khách hàng</strong>
      </div>
    </div>
  );
}

export default function CustomerProfile({
  user,
  accessToken,
  onSessionExpired,
}) {
  return (
    <section className="member-profile-page">
      <div className="member-content-heading">
        <div>
          <span className="member-section-eyebrow">
            ACCOUNT SETTINGS
          </span>
          <h2>Thông tin cá nhân</h2>
          <p>
            Quản lý thông tin liên hệ và bảo mật tài khoản thành viên.
          </p>
        </div>

        <span className="member-section-count">
          ACCOUNT / 03
        </span>
      </div>

      <section className="member-profile-section">
        <div className="member-profile-section-heading">
          <div>
            <span>01 / PERSONAL INFORMATION</span>
            <h3>Thông tin thành viên</h3>
            <p>
              Thông tin hiện tại của tài khoản QMD SPORT.
            </p>
          </div>
        </div>

        <div className="member-account-card">
          <MemberIdentity user={user} />
          <MemberDetails user={user} />
        </div>

        <p className="member-profile-note">
          Nếu muốn thay đổi họ tên hoặc số điện thoại, vui lòng liên hệ
          bộ phận hỗ trợ khách hàng qua khung chat QMD SPORT.
        </p>
      </section>

      <section className="member-profile-section">
        <div className="member-profile-section-heading">
          <div>
            <span>02 / ACCOUNT SECURITY</span>
            <h3>Bảo mật tài khoản</h3>
            <p>
              Cập nhật mật khẩu để bảo vệ tài khoản của bạn.
            </p>
          </div>
        </div>

        <ChangePasswordForm
          accessToken={accessToken}
          onSessionExpired={onSessionExpired}
        />
      </section>
    </section>
  );
}
