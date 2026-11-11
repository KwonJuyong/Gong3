"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "../actions";
import { useEscape } from "../components/useEscape";
import { roleLabel as labelOfRole } from "../lib/roleLabel";

/** 머리글 아바타 드롭다운. 프로필 화면으로 가는 입구와 로그아웃만 둠 */

export default function ProfileDropdown({
  user,
  /** 계좌가 없어 보상 지급이 막히는 상태인가 */
  payoutBlocked,
}: {
  user: {
    name: string;
    studentId: string;
    role: string;
    userType?: string;
    profileImage?: string | null;
  };
  payoutBlocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEscape(open, () => setOpen(false));

  const initials = user.name.charAt(0).toUpperCase();
  const roleLabel = labelOfRole(user.role, user.userType);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-full bg-[var(--gray-600)] text-white text-sm font-semibold flex items-center justify-center hover:bg-[var(--gray-700)] transition-colors overflow-hidden"
        aria-label="프로필 메뉴"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.profileImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
        {/* 지급이 막혀 있으면 드롭다운을 열지 않아도 표시함 */}
        {payoutBlocked && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--danger)] ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-[var(--radius-lg)] border border-[var(--gray-200)] shadow-[var(--shadow-lg)] z-50 overflow-hidden">
          <div className="flex items-center gap-3 p-4 pb-3 border-b border-[var(--gray-100)] bg-[var(--surface)]">
            <div className="w-11 h-11 rounded-full bg-[var(--gray-600)] text-white text-lg font-semibold flex items-center justify-center shrink-0 overflow-hidden">
              {user.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--foreground)] truncate">{user.name}</p>
              <p className="text-xs text-[var(--muted)] truncate">{user.studentId}</p>
              <span className="inline-block mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)]">
                {roleLabel}
              </span>
            </div>
          </div>

          {payoutBlocked && (
            <div className="px-4 pt-3">
              <Link
                href="/dashboard/profile?tab=settlement"
                onClick={() => setOpen(false)}
                className="block text-xs text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)] leading-snug hover:opacity-90"
              >
                계좌가 없어 <strong>보상을 지급할 수 없습니다.</strong> 지금 등록하기 →
              </Link>
            </div>
          )}

          <div className="p-2 space-y-1">
            <Link
              href="/dashboard/profile"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors"
            >
              프로필 관리
            </Link>
            <form action={logoutAction}>
              <button className="flex items-center w-full px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--gray-700)] hover:bg-[var(--danger-light)] hover:text-[var(--danger)] transition-colors">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
