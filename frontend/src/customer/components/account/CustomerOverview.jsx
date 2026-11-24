
import { useEffect, useState } from "react";
import { getMyMembership } from "../../services/membership.service";

import bronzeImage from "../../../assets/hang-thanh-vien-dong.webp";
import silverImage from "../../../assets/hang-thanh-vien-bac.webp";
import goldImage from "../../../assets/hang-thanh-vien-vang.webp";
import diamondImage from "../../../assets/hang-thanh-vien-kim-cuong.webp";

const TIER_IMAGES = {
  BRONZE: bronzeImage,
  SILVER: silverImage,
  GOLD: goldImage,
  DIAMOND: diamondImage,
};

const BENEFIT_LABELS = {
  "ưu đãi dành riêng cho thành viên": "Ưu đãi dành riêng cho thành viên",
  "ưu đãi sinh nhật": "Ưu đãi sinh nhật",
  "chương trình chăm sóc thành viên": "Chương trình chăm sóc thành viên",
};

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

function formatCurrency(value) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "0 ₫";

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function MemberIdentity({ user }) {
  return (
    <div className="member-account-identity">
      <div className="member-account-avatar">
        {getInitial(user?.fullName)}
      </div>

      <div>
        <span>THÀNH VIÊN LAN ANH SPORT</span>
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

function MembershipCard({
  membership,
  loading,
  error,
  onRetry,
}) {
  if (loading) {
    return (
      <section className="member-tier-section">
        <div className="member-content-heading">
          <div>
            <span className="member-section-eyebrow">
              MEMBERSHIP PROGRAM
            </span>
            <h2>Hạng thành viên</h2>
            <p>Đang tải thông tin tích lũy của bạn...</p>
          </div>
        </div>

        <div className="member-tier-message" aria-live="polite">
          Đang tải thông tin hạng thành viên...
        </div>
      </section>
    );
  }

  if (error || !membership?.currentTier) {
    return (
      <section className="member-tier-section">
        <div className="member-content-heading">
          <div>
            <span className="member-section-eyebrow">
              MEMBERSHIP PROGRAM
            </span>
            <h2>Hạng thành viên</h2>
            <p>Thông tin cấp bậc và tiến độ tích lũy của bạn.</p>
          </div>
        </div>

        <div className="member-tier-message member-tier-error">
          <p>{error || "Chưa có dữ liệu hạng thành viên."}</p>
          <button type="button" onClick={onRetry}>
            Thử tải lại
          </button>
        </div>
      </section>
    );
  }

  const {
    totalSpend = 0,
    purchaseCount = 0,
    currentTier,
    nextTier,
    remainingAmount = 0,
    progress = 0,
    isMaxTier = false,
    benefits = [],
  } = membership;

  const tierImage = TIER_IMAGES[currentTier.key];
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <section className="member-tier-section">
      <div className="member-content-heading">
        <div>
          <span className="member-section-eyebrow">
            MEMBERSHIP PROGRAM
          </span>
          <h2>Hạng thành viên</h2>
          <p>
            Theo dõi cấp bậc và giá trị mua hàng tích lũy tại LAN ANH SPORT.
          </p>
        </div>

        <span className="member-section-count">MEMBER / 02</span>
      </div>

      <div className="member-tier-card">
        <div className="member-tier-main">
          <div className="member-tier-image-wrap">
            {tierImage ? (
              <img
                src={tierImage}
                alt={`Hạng thành viên ${currentTier.name}`}
                className="member-tier-image"
              />
            ) : (
              <div className="member-tier-image-fallback">
                LAN ANH
              </div>
            )}
          </div>

          <div className="member-tier-information">
            <span className="member-tier-eyebrow">
              CURRENT MEMBERSHIP
            </span>

            <h3>{currentTier.name}</h3>

            <p>
              {isMaxTier
                ? "Bạn đã đạt cấp bậc thành viên cao nhất."
                : `Bạn đang sở hữu hạng thành viên ${currentTier.name}. Hãy tiếp tục mua sắm để nâng cấp.`}
            </p>

            <div className="member-tier-stats">
              <div>
                <span>TỔNG CHI TIÊU TÍCH LŨY</span>
                <strong>{formatCurrency(totalSpend)}</strong>
              </div>

              <div>
                <span>ĐƠN HÀNG HOÀN TẤT</span>
                <strong>{Number(purchaseCount) || 0}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="member-tier-progress">
          {isMaxTier ? (
            <div className="member-tier-max">
              <span className="member-tier-max-icon">✦</span>
              <div>
                <strong>Hạng cao nhất</strong>
                <p>Bạn đã đạt hạng Kim cương của LAN ANH SPORT.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="member-tier-progress-heading">
                <span>TIẾN ĐỘ NÂNG HẠNG</span>
                <strong>{safeProgress.toFixed(1)}%</strong>
              </div>

              <div
                className="member-tier-progress-track"
                role="progressbar"
                aria-label="Tiến độ nâng hạng thành viên"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={safeProgress}
              >
                <div
                  className="member-tier-progress-fill"
                  style={{ width: `${safeProgress}%` }}
                />
              </div>

              <div className="member-tier-next">
                <span>
                  Hạng tiếp theo: <strong>{nextTier?.name || "—"}</strong>
                </span>

                <span>
                  Còn thiếu{" "}
                  <strong>{formatCurrency(remainingAmount)}</strong>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="member-tier-benefits">
        <div className="member-tier-benefits-heading">
          <div>
            <span className="member-section-eyebrow">
              MEMBER PRIVILEGES
            </span>
            <h3>Đặc quyền thành viên</h3>
          </div>
          <span className="member-tier-coming-soon">
            ĐANG PHÁT TRIỂN
          </span>
        </div>

        <div className="member-tier-benefits-list">
          {benefits.length > 0 ? (
            benefits.map((benefit, index) => {
              const label =
                BENEFIT_LABELS[String(benefit.name || "").toLowerCase()] ||
                benefit.name ||
                "Quyền lợi thành viên";

              return (
                <div
                  className="member-tier-benefit"
                  key={benefit.key || benefit.name || index}
                >
                  <span className="member-tier-benefit-icon">✦</span>
                  <div>
                    <strong>{label}</strong>
                    <small>Đang triển khai</small>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="member-tier-benefit">
              <span className="member-tier-benefit-icon">✦</span>
              <div>
                <strong>Quyền lợi thành viên</strong>
                <small>Đang triển khai</small>
              </div>
            </div>
          )}
        </div>

        <p className="member-tier-benefits-note">
          Các quyền lợi đang được LAN ANH SPORT phát triển và chưa áp dụng
          thực tế tại thời điểm hiện tại.
        </p>
      </div>
    </section>
  );
}

export default function CustomerOverview({
  user,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
  onOpenProfile,
}) {
  const memberName = getMemberName(user);
  const memberSince = getMemberSince(user);

  const [membership, setMembership] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMembership() {
      setMembershipLoading(true);
      setMembershipError("");

      try {
        const result = await getMyMembership({
          accessToken,
          onSessionRefresh,
          onSessionExpired,
        });

        if (active) {
          setMembership(result);
        }
      } catch (error) {
        if (active) {
          setMembershipError(
            error.message || "Không thể tải thông tin hạng thành viên."
          );
        }
      } finally {
        if (active) {
          setMembershipLoading(false);
        }
      }
    }

    if (accessToken) {
      loadMembership();
    } else {
      setMembershipError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      setMembershipLoading(false);
    }

    return () => {
      active = false;
    };
  }, [accessToken, onSessionRefresh, onSessionExpired]);

  async function retryMembership() {
    setMembershipLoading(true);
    setMembershipError("");

    try {
      const result = await getMyMembership({
        accessToken,
        onSessionRefresh,
        onSessionExpired,
      });

      setMembership(result);
    } catch (error) {
      setMembershipError(
        error.message || "Không thể tải thông tin hạng thành viên."
      );
    } finally {
      setMembershipLoading(false);
    }
  }

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
            Chào mừng bạn quay trở lại LAN ANH SPORT.
            <br />
            Đây là không gian dành riêng cho tài khoản thành viên của bạn.
          </p>

          <div className="member-welcome-meta">
            <span>✦</span>
            LAN ANH SPORT MEMBER

            {memberSince && (
              <>
                <span className="member-meta-divider">/</span>
                THÀNH VIÊN TỪ {memberSince}
              </>
            )}
          </div>
        </div>

        <div className="member-welcome-mark" aria-hidden="true">
          <span>LAN ANH</span>
          <strong>SPORT</strong>
          <small>YOUR GAME. YOUR STYLE.</small>
        </div>
      </section>

      <MembershipCard
        membership={membership}
        loading={membershipLoading}
        error={membershipError}
        onRetry={retryMembership}
      />

      <section className="member-account-section">
        <div className="member-content-heading">
          <div>
            <span className="member-section-eyebrow">
              PERSONAL DETAILS
            </span>
            <h2>Thông tin thành viên</h2>
            <p>
              Thông tin cơ bản được sử dụng trong tài khoản LAN ANH SPORT.
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
