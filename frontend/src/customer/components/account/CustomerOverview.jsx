
function getInitial(name) {
  return (name || "U").trim().charAt(0).toUpperCase();
}

function getMemberName(user) {
  return user?.fullName?.trim() || "Thành viên";
}

function getMemberSince(user) {
  if (!user?.createdAt) return null;

  const date = new Date(user.createdAt);

  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("vi-VN", {
    month: "2-digit",
    year: "numeric",
  }).format(date);
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

export default function CustomerOverview({ user, onOpenProfile }) {
  const memberName = getMemberName(user);
  const memberSince = getMemberSince(user);

  return (
    <>
      <section className="member-welcome">
        <div className="member-welcome-copy">
          <span className="member-kicker">
            <span />
            YOUR MEMBER SPACE
          </span>

          <h1>
            Xin chào,
            <br />
            <strong>{memberName}!</strong>
          </h1>

          <p>
            Chào mừng bạn quay trở lại QMD SPORT.
            <br />
            Đây là không gian dành riêng cho tài khoản thành viên của bạn.
          </p>

          <div className="member-welcome-meta">
            <span>✦</span>
            QMD SPORT MEMBER

            {memberSince && (
              <>
                <span className="member-meta-divider">/</span>
                THÀNH VIÊN TỪ {memberSince}
              </>
            )}
          </div>
        </div>

        <div className="member-welcome-mark" aria-hidden="true">
          <span>QMD</span>
          <strong>SPORT</strong>
          <small>YOUR GAME. YOUR STYLE.</small>
        </div>
      </section>

      <section className="member-account-section">
        <div className="member-content-heading">
          <div>
            <span className="member-section-eyebrow">
              PERSONAL DETAILS
            </span>
            <h2>Thông tin thành viên</h2>
            <p>
              Thông tin cơ bản được sử dụng trong tài khoản QMD SPORT.
            </p>
          </div>

          <span className="member-section-count">
            ACCOUNT / 01
          </span>
        </div>

        <div className="member-account-card">
          <MemberIdentity user={user} />
          <MemberDetails user={user} />
        </div>

        <div className="member-overview-action">
          <div>
            <strong>Quản lý hồ sơ cá nhân</strong>
            <p>
              Xem thông tin liên hệ và thiết lập bảo mật tài khoản.
            </p>
          </div>

          <button type="button" onClick={onOpenProfile}>
            Thông tin cá nhân <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>
    </>
  );
}
