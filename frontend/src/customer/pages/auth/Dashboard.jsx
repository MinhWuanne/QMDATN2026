
import { useState } from "react";
import { Brand, Notice } from "../../components/auth/AuthComponents.jsx";
import "./dashboard.css";

import CustomerOverview from "../../components/account/CustomerOverview.jsx";
import CustomerProfile from "../../components/account/CustomerProfile.jsx";

import AddressBook from "../../components/account/AddressBook.jsx";

const navigation = [
  { id: "overview", label: "Tổng quan", icon: "⌂", enabled: true },
  { id: "orders", label: "Đơn hàng", icon: "▤", status: "Đang làm" },
  { id: "returns", label: "Đổi / trả", icon: "↺", status: "Chuẩn bị" },
  {
    id: "profile",
    label: "Thông tin cá nhân",
    icon: "◎",
    enabled: true,
  },
  {
    id: "addresses",
    label: "Sổ địa chỉ",
    icon: "⌖",
    enabled: true,
  },
];

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

function MemberFooter() {
  return (
    <footer className="member-footer">
      <strong>
        QMD <span>SPORT</span>
      </strong>
      <p>YOUR GAME. YOUR STYLE. YOUR EXPERIENCE.</p>
      <small>© QMD SPORT MEMBER CENTER</small>
    </footer>
  );
}

export default function Dashboard({
  user,
  accessToken,
  onSessionRefresh,
  onSessionExpired,
  onLogout,
  logoutLoading,
  logoutError,
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const memberName = getMemberName(user);

  const currentSection = navigation.find(
    (item) => item.id === activeSection
  );

  return (
    <main className="member-dashboard">
      <aside className="member-sidebar">
        <div className="member-sidebar-brand">
          <Brand />
        </div>

        <div className="member-sidebar-heading">
          <span>MEMBER CENTER</span>
          <strong>Quản lý tài khoản</strong>
        </div>

        <nav className="member-sidebar-nav" aria-label="Điều hướng tài khoản">
          <span className="member-sidebar-label">MENU CHÍNH</span>

          {navigation.map((item) => {
            const isActive = activeSection === item.id;
            const isEnabled = Boolean(item.enabled);

            return (
              <button
                key={item.id}
                type="button"
                className={`member-sidebar-link ${isActive ? "active" : ""
                  }`}
                disabled={!isEnabled}
                onClick={() => {
                  if (isEnabled) setActiveSection(item.id);
                }}
                aria-current={isActive ? "page" : undefined}
                title={
                  !isEnabled
                    ? `${item.label} - ${item.status || "Chưa triển khai"}`
                    : item.label
                }
              >
                <span className="member-sidebar-icon" aria-hidden="true">
                  {item.icon}
                </span>

                <span className="member-sidebar-link-text">
                  {item.label}
                </span>

                {!isEnabled && item.status && (
                  <span
                    className={`member-sidebar-mini-status ${item.status === "Đang làm"
                      ? "in-progress"
                      : item.status === "Chuẩn bị"
                        ? "preparing"
                        : "upcoming"
                      }`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="member-sidebar-bottom">
          <div className="member-sidebar-member">
            <div className="member-sidebar-avatar">
              {getInitial(user?.fullName)}
            </div>

            <div className="member-sidebar-member-info">
              <strong>{memberName}</strong>
              <span>Thành viên</span>
            </div>
          </div>

          <button
            className="member-sidebar-logout"
            type="button"
            onClick={onLogout}
            disabled={logoutLoading}
          >
            <span aria-hidden="true">↗</span>
            {logoutLoading ? "ĐANG ĐĂNG XUẤT..." : "ĐĂNG XUẤT"}
          </button>
        </div>
      </aside>

      <div className="member-main">
        <header className="member-topbar">
          <div>
            <span className="member-topbar-eyebrow">
              QMD SPORT / MEMBER CENTER
            </span>
            <h2>{currentSection?.label || "Tổng quan"}</h2>
          </div>

          <div className="member-topbar-user">
            <span className="member-topbar-avatar">
              {getInitial(user?.fullName)}
            </span>

            <div>
              <strong>{memberName}</strong>
              <span>Tài khoản khách hàng</span>
            </div>
          </div>
        </header>

        <div className="member-main-content">
          <Notice>{logoutError}</Notice>

          {activeSection === "overview" && (
            <CustomerOverview
              user={user}
              onOpenProfile={() => setActiveSection("profile")}
            />
          )}

          {activeSection === "profile" && (
            <CustomerProfile
              user={user}
              accessToken={accessToken}
              onSessionExpired={onSessionExpired}
            />
          )}

          {activeSection === "addresses" && (
            <AddressBook
              accessToken={accessToken}
              onSessionRefresh={onSessionRefresh}
              onSessionExpired={onSessionExpired}
            />
          )}

          <MemberFooter />
        </div>
      </div>
    </main>
  );
}
