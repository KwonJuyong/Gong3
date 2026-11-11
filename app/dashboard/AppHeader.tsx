"use client";

import Link from "next/link";
import ManualButton from "./ManualButton";
import NotificationBell, { type NotificationItem } from "./NotificationBell";
import ProfileDropdown from "./ProfileDropdown";

/**
 * 대시보드 공용 머리글. 페이지는 제목과 본문만 그리고 로고·알림·설명서·프로필은 여기서 그림
 *
 * - 모바일 메뉴 버튼은 nav:open 이벤트로 NavRail 드로어를 열기
 */
export default function AppHeader({
  user,
  payoutBlocked,
  notifications,
  unreadNotifications,
}: {
  user: {
    name: string;
    studentId: string;
    role: string;
    userType?: string;
    profileImage?: string | null;
  };
  payoutBlocked: boolean;
  notifications: NotificationItem[];
  unreadNotifications: number;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[var(--gray-200)]">
      <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("nav:open"))}
            aria-label="메뉴 열기"
            className="lg:hidden w-10 h-10 -ml-1 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-700)] hover:bg-[var(--gray-50)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {/* 데스크톱은 레일 머리에 로고가 있으므로 모바일에서만 */}
          <Link href="/dashboard" className="lg:hidden flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="w-7 h-7" />
            <span className="text-base font-bold text-[var(--gray-900)] truncate">AI 평가단</span>
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <ManualButton userType={user.userType} role={user.role} />
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadNotifications}
            canAnnounce={user.role === "ADMIN"}
          />
          <span className="hidden md:inline text-sm text-[var(--gray-700)] px-1">{user.name}</span>
          <ProfileDropdown user={user} payoutBlocked={payoutBlocked} />
        </div>
      </div>
    </header>
  );
}
