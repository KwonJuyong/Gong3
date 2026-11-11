import Link from "next/link";
import type { CompletionTab } from "../../lib/profileCompletion";

/**
 * 좌측 탭(서버 컴포넌트). 활성 탭은 ?tab= 쿼리로 정함
 * 다른 화면에서 특정 탭으로 바로 링크할 수 있고, 보지 않는 탭의 데이터는 내려보내지 않음
 */

export type TabKey =
  | "basic"
  | "settlement"
  | "biz"
  | "notify"
  | "security";

export interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
  desc: string;
}

// 발주 권한이 사업자등록번호로 정해지므로 기업 정보 탭은 모두에게 열기
// 완성도 게이지 포함 여부는 따로 정함(profileCompletion.ts 의 showBiz).
export const TABS: TabDef[] = [
  { key: "basic", label: "기본 정보", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", desc: "이름·이메일(로그인 ID)·연락처" },
  { key: "settlement", label: "정산 정보", icon: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7ZM2 10h20M6 15h4", desc: "계좌·주민번호·서명" },
  { key: "biz", label: "기업 정보", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01", desc: "사업자등록·세금계산서" },
  { key: "notify", label: "알림", icon: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0", desc: "웹 푸시 알림" },
  { key: "security", label: "보안", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", desc: "학번·사번·비밀번호" },
];

export default function ProfileTabs({
  active,
  tabsWithMissing,
}: {
  active: TabKey;
  /** 미완 항목이 있는 탭(점으로 표시) */
  tabsWithMissing: Set<CompletionTab>;
}) {
  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {TABS.map((t) => {
        const on = t.key === active;
        const missing = tabsWithMissing.has(t.key as CompletionTab);
        return (
          <Link
            key={t.key}
            href={`/dashboard/profile?tab=${t.key}`}
            aria-current={on ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5 whitespace-nowrap transition-colors ${
              on
                ? "bg-white text-[var(--foreground)] font-semibold"
                : "text-[var(--gray-700)] hover:bg-[var(--gray-50)]"
            }`}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d={t.icon} />
            </svg>
            <span className="min-w-0">
              <span className={`block text-sm ${on ? "font-semibold" : "font-medium"}`}>
                {t.label}
              </span>
              <span className="hidden lg:block text-xs text-[var(--gray-500)] font-normal">
                {t.desc}
              </span>
            </span>
            {missing && (
              <span
                className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0"
                aria-label="미입력 항목 있음"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
