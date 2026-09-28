"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ManualButton from "./ManualButton";
import ProfileDropdown from "./ProfileDropdown";

/**
 * 대시보드 공용 머리글. 페이지는 제목과 본문만 그리고 로고·알림·설명서·프로필은 여기서 그린다.
 *
 * - 모바일 메뉴 버튼은 nav:open 이벤트로 NavRail 드로어를 연다.
 * - 알림 종은 hub:open-noti 로 허브의 알림함을 열고, 허브가 hub:noti-unread 로 개수를 알려준다.
 */
export default function AppHeader({
  user,
  participatedCount,
  completionPercent,
  payoutBlocked,
  unreadNotifications,
}: {
  user: {
    name: string;
    studentId: string;
    role: string;
    userType?: string;
    major?: string;
    phone?: string;
    email?: string;
    profileImage?: string | null;
  };
  participatedCount: number;
  completionPercent: number;
  payoutBlocked: boolean;
  unreadNotifications: number;
}) {
  const [unread, setUnread] = useState(unreadNotifications);
  useEffect(() => setUnread(unreadNotifications), [unreadNotifications]);
  useEffect(() => {
    const h = (e: Event) => setUnread((e as CustomEvent<number>).detail);
    window.addEventListener("hub:noti-unread", h);
    return () => window.removeEventListener("hub:noti-unread", h);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--gray-200)]">
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
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("hub:open-noti"))}
            aria-label={unread > 0 ? `알림 ${unread}건 읽지 않음` : "알림"}
            className="relative w-10 h-10 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-700)] hover:bg-[var(--gray-50)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-xs font-semibold leading-[18px] text-center ring-2 ring-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          <span className="hidden md:inline text-sm text-[var(--gray-700)] px-1">{user.name}</span>
          <ProfileDropdown
            user={user}
            participatedCount={participatedCount}
            completionPercent={completionPercent}
            payoutBlocked={payoutBlocked}
          />
        </div>
      </div>
    </header>
  );
}
