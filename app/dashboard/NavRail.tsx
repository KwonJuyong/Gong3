"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEscape } from "../components/useEscape";
import { useCanInstall, promptInstall } from "../pwa-install";

// 좌측 접이식 내비게이션(대시보드 layout 에서 렌더).
// - 데스크톱(lg+): 펼침(라벨) ↔ 접힘(아이콘) 토글, 상태는 localStorage 에 저장.
// - 모바일: 머리글(AppHeader)의 메뉴 버튼이 보내는 nav:open 이벤트로 드로어를 열기
// - 앱 설치는 PWA 로 통일하고, OS 마다 다른 설치 방법을 모달에서 안내함

type Role = string;
// gate: "transact" 는 발주·견적서 권한(유효한 사업자등록번호 또는 ADMIN).
// role 과 별개 조건이라 따로 두고, 판정은 서버(canTransact)가 한 결과를 받음
type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  gate?: "transact";
};
type NavGroup = { label?: string; items: NavItem[] };

const I = (d: string, extra?: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
);

const GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "홈", icon: I("M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z") },
      { href: "/dashboard/surveys", label: "평가 찾기", icon: I("M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11") },
      { href: "/dashboard/services", label: "평가 만들기", icon: I("M12 5v14M5 12h14"), roles: ["DEVELOPER", "ADMIN"] },
      // 평가 흐름의 일부라 여기 둠. 관리자 전용 표시는 자물쇠 배지로 함
      {
        href: "/dashboard/approvals",
        label: "평가 승인",
        icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", <path d="m9 12 2 2 4-4" />),
        roles: ["ADMIN"],
      },
      { href: "/dashboard/insights", label: "AI News", icon: I("M4 22V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16a2 2 0 0 0 2 2H4ZM8 7h6M8 11h6M8 15h4") },
      // 인증 준비 자가점검(부가 기능)
      { href: "/dashboard/certification", label: "인증 준비", icon: I("M9 12l2 2 4-4M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z") },
      // 자연어 데이터 조회. 볼 수 있는 범위는 queryPolicy 가 정하므로 메뉴는 모두에게 보임
      { href: "/dashboard/query", label: "데이터 조회", icon: I("M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35") },
    ],
  },
  // 정산 화면은 두 흐름으로 나눔
  // "거래": 기업 대금이 플랫폼을 거쳐 학생에게 가는 흐름
  // "연구비": 연구과제비에서 지급하는 흐름
  {
    label: "거래",
    items: [
      // role 이 아니라 사업자등록번호 보유 여부로 열기
      { href: "/dashboard/orders", label: "평가 의뢰", icon: I("M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0"), gate: "transact" },
      { href: "/dashboard/settlement", label: "보상 정산", icon: I("M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"), roles: ["ADMIN"] },
    ],
  },
  {
    label: "연구비",
    items: [
      { href: "/dashboard/payroll", label: "노무비 청구", icon: I("M4 3h16v18l-3-1.5L14 21l-2-1.5L10 21l-3-1.5L4 21V3ZM8 8h8M8 12h5") },
      // 하위 화면은 /dashboard/cost 안의 탭(CostNav)으로 이동함
      { href: "/dashboard/cost", label: "비용 관리", icon: I("M3 3v18h18M8 16V9M13 16V6M18 16v-4"), roles: ["ADMIN"] },
    ],
  },
  // 「관리」에는 거래·연구비 어느 쪽에도 속하지 않는 항목만 둠
  // 두 그룹 안의 관리자 전용 항목은 자물쇠 배지로 표시함
  {
    label: "관리",
    items: [
      { href: "/dashboard/members", label: "회원 관리", icon: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), roles: ["ADMIN"] },
      { href: "/dashboard/org", label: "조직 설정", icon: I("M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"), roles: ["ADMIN"] },
      // 위: AI 도우미 질의 감사 로그. 아래: 법정 접속기록과 월 점검
      { href: "/dashboard/access", label: "접속 기록", icon: I("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0", <path d="M19 3v4M21 5h-4" />), roles: ["ADMIN"] },
      { href: "/dashboard/audit", label: "조회 감사 로그", icon: I("M9 12h6M9 16h6M9 8h6M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"), roles: ["ADMIN"] },
    ],
  },
];

/** 관리자만 보이는 항목인가: 자물쇠 배지 판정 */
const isAdminOnly = (it: NavItem) => it.roles?.length === 1 && it.roles[0] === "ADMIN";

export default function NavRail({
  userRole,
  pendingApprovals = 0,
  canTransact = false,
  accessReviewDue = false,
}: {
  userRole: string;
  /** 승인 대기 건수(배지) */
  pendingApprovals?: number;
  /** 발주·견적서 게이트 통과 여부. 서버(layout)가 판정해서 내려줌 */
  canTransact?: boolean;
  /** 지난달 접속기록 점검(월 1회)을 하지 않았으면 「접속 기록」에 빨간 점 */
  accessReviewDue?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [install, setInstall] = useState(false);
  // 이미 설치된 앱(PWA·MSIX·TWA)으로 실행 중이면 "앱 설치" 항목이 무의미함
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    // 사이트 데이터를 막은 브라우저에서는 localStorage 접근만으로 예외가 남
    try {
      // 서버 렌더와 맞추려고 마운트 뒤에 읽음
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem("navrail-collapsed") === "1");
    } catch {}

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) setInApp(true);
  }, []);

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener("nav:open", open);
    return () => window.removeEventListener("nav:open", open);
  }, []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  useEscape(mobileOpen, closeMobile);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem("navrail-collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  // role 조건과 거래 권한 조건을 모두 만족해야 보임
  const canSee = (it: NavItem) =>
    (!it.roles || it.roles.includes(userRole)) && (!it.gate || canTransact);
  // 평가 만들기의 입력 화면은 대시보드의 ?view=create* 에 있음
  const creating = pathname === "/dashboard" && (searchParams.get("view") ?? "").startsWith("create");
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href && !creating;
    if (href === "/dashboard/services" && creating) return true;
    return pathname === href || pathname.startsWith(href + "/");
  };

  // 레일 내부(펼침/접힘 공용) 콘텐츠
  const railBody = (compact: boolean, onNavigate?: () => void) => (
    <>
      {GROUPS.map((group, gi) => {
        const visible = group.items.filter(canSee);
        if (visible.length === 0) return null;
        return (
          <div key={gi} className="px-2">
            {group.label && !compact && (
              <p className="px-2 pt-3 pb-1 text-xs font-semibold text-[var(--gray-500)]">
                {group.label}
              </p>
            )}
            {group.label && compact && gi > 0 && <div className="my-2 mx-2 border-t border-[var(--gray-100)]" />}
            <div className="space-y-0.5">
              {visible.map((it) => {
                const active = isActive(it.href);
                // 승인 대기 건수 배지(지금은 이 항목뿐)
                const badge = it.href === "/dashboard/approvals" ? pendingApprovals : 0;
                const dot = it.href === "/dashboard/access" && accessReviewDue;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={compact ? it.label : undefined}
                    className={`relative flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-sm transition-colors ${
                      compact ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-[var(--gray-100)] text-[var(--foreground)] font-semibold"
                        : "text-[var(--gray-600)] hover:bg-[var(--gray-50)]"
                    }`}
                  >
                    <span className="shrink-0">{it.icon}</span>
                    {!compact && <span className="truncate">{it.label}</span>}
                    {/* 접힌 상태에서는 숫자를 넣을 자리가 없어 점으로만 알림 */}
                    {dot && (
                      <span
                        className={compact ? "absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--danger)]" : "ml-auto shrink-0 w-2 h-2 rounded-full bg-[var(--danger)]"}
                        aria-label="지난달 점검 필요"
                      />
                    )}
                    {compact && badge > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--danger)]" />
                    )}
                    {!compact && badge > 0 && (
                      <span className="ml-auto shrink-0 min-w-[18px] px-1.5 py-0.5 text-xs font-bold text-center rounded-full bg-[var(--danger)] text-white">
                        {badge}
                      </span>
                    )}
                    {/* 관리자 전용 표시. 배지와 겹치므로 배지가 있으면 그리지 않음 */}
                    {!compact && isAdminOnly(it) && badge === 0 && !dot && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-auto shrink-0 text-[var(--gray-500)]"
                        aria-label="관리자 전용"
                      >
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 앱 설치 (웹 브라우저에서 접속했을 때만) */}
      {!inApp && (
      <div className="mt-auto px-2 pb-2 pt-3">
        <div className="mx-2 mb-2 border-t border-[var(--gray-100)]" />
        <button
          onClick={() => {
            setInstall(true);
            onNavigate?.();
          }}
          title={compact ? "앱 설치" : undefined}
          className={`w-full flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-sm text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors ${
            compact ? "justify-center" : ""
          }`}
        >
          <span className="shrink-0">
            {I("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3")}
          </span>
          {!compact && <span className="truncate">앱 설치</span>}
        </button>
      </div>
      )}
    </>
  );

  return (
    <>
      <aside
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen border-r border-[var(--gray-200)] bg-white transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className={`flex items-center h-14 px-3 border-b border-[var(--gray-100)] ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2 pl-1 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="w-7 h-7" />
              <span className="text-base font-bold text-[var(--gray-900)] truncate">AI 평가단</span>
            </Link>
          )}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-500)] hover:bg-[var(--gray-50)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${collapsed ? "rotate-180" : ""}`}>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col flex-1 overflow-y-auto py-1">{railBody(collapsed)}</nav>
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="메뉴" className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-[var(--shadow-lg)] flex flex-col animate-[slidein_0.18s_ease-out]">
            <div className="flex items-center justify-between h-14 px-4 border-b border-[var(--gray-100)]">
              <Link href="/dashboard" onClick={closeMobile} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="" className="w-7 h-7" />
                <span className="text-base font-bold text-[var(--gray-900)]">AI 평가단</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="닫기"
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-500)] hover:bg-[var(--gray-50)]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col flex-1 overflow-y-auto py-1">
              {railBody(false, () => setMobileOpen(false))}
            </nav>
          </div>
        </div>
      )}

      {install && <InstallModal onClose={() => setInstall(false)} />}

      <style>{`@keyframes slidein{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}

// 접속 기기(OS)를 감지해 알맞은 설치 방법을 위에 크게 보여주는 모달.
// 브라우저가 설치 프롬프트를 넘겨줬다면 안내문 대신 진짜 설치 버튼을 띄움
function InstallModal({ onClose }: { onClose: () => void }) {
  const [os, setOs] = useState<"windows" | "mac" | "ios" | "android" | "other">("other");
  const canInstall = useCanInstall();
  useEscape(true, onClose);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (/android/i.test(ua)) setOs("android");
    else if (isIOS) setOs("ios");
    else if (/win/i.test(navigator.platform) || /windows/i.test(ua)) setOs("windows");
    else if (/mac/i.test(navigator.platform)) setOs("mac");
    else setOs("other");
  }, []);

  const order = ["windows", "mac", "ios", "android"].sort((a, b) => (a === os ? -1 : b === os ? 1 : 0));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="앱 설치">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--gray-100)]">
          <h3 className="text-base font-bold text-[var(--foreground)]">앱 설치</h3>
          <button onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-500)] hover:bg-[var(--gray-50)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {canInstall ? (
            // 브라우저가 넘겨준 설치 프롬프트를 띄움
            <button
              onClick={async () => {
                if (await promptInstall()) onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              이 기기에 설치
            </button>
          ) : (
            // 프롬프트가 없는 경우는 둘 중 하나임: 이미 설치됐거나(크롬 주소창이 "앱에서 열기"를
            // 보여주는 상태), 브라우저가 자동 설치를 지원하지 않거나(Safari·Firefox).
            <p className="text-xs text-[var(--muted)] leading-relaxed bg-[var(--gray-50)] rounded-[var(--radius-md)] px-3 py-2.5">
              이미 설치되어 있으면 주소창에 설치 아이콘 대신 <b>앱에서 열기</b>가 나타납니다. 그 버튼으로 바로 실행할 수 있어요.
              앱 아이콘이 예전 것으로 보인다면 <b>앱을 제거하고 다시 설치</b>해 주세요. 브라우저가 설치 시점의 아이콘을 캐시합니다.
            </p>
          )}
          {order.map((k) => (
            <PlatformCard key={k} platform={k as "windows" | "mac" | "ios" | "android"} detected={k === os} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ platform, detected }: { platform: "windows" | "mac" | "ios" | "android"; detected: boolean }) {
  const [open, setOpen] = useState(detected);

  // soon: 스토어 전용 앱이 아직 없는 플랫폼. PWA 설치는 지금도 동작하므로 안내는 유지함
  const meta = {
    windows: { name: "Windows", soon: false },
    mac: { name: "Mac", soon: false },
    ios: { name: "iPhone / iPad", soon: true },
    android: { name: "Android", soon: true },
  }[platform];

  return (
    <div className={`rounded-[var(--radius-md)] border ${detected ? "border-[var(--accent)]" : "border-[var(--gray-200)]"} overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--gray-50)] transition-colors">
        <span className="text-sm font-medium text-[var(--foreground)] flex-1 text-left">{meta.name}</span>
        {meta.soon && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)]">준비중</span>}
        {detected && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)]">현재 기기</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-[var(--gray-500)] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 text-sm text-[var(--gray-600)] space-y-2">{body(platform)}</div>}
    </div>
  );
}

function body(platform: "windows" | "mac" | "ios" | "android") {
  if (platform === "windows") {
    return (
      <>
        <p className="leading-relaxed">브라우저에서 앱처럼 설치하면 바탕화면 아이콘이 생기고 독립 창으로 열립니다.</p>
        <ul className="list-disc pl-5 space-y-1 text-[var(--gray-600)]">
          <li><b>Chrome/Edge</b>: 주소창 오른쪽 <b>설치</b> 아이콘 클릭</li>
        </ul>
        <p className="text-xs text-[var(--muted)]">설치 후에는 시작 메뉴에서 바로 실행됩니다.</p>
      </>
    );
  }
  if (platform === "mac") {
    return (
      <>
        <p className="leading-relaxed">Mac은 브라우저에서 앱처럼 설치하는 게 가장 간편합니다(무료).</p>
        <ul className="list-disc pl-5 space-y-1 text-[var(--gray-600)]">
          <li><b>Chrome/Edge</b>: 주소창 오른쪽 <b>설치</b> 아이콘 클릭</li>
          <li><b>Safari</b>: 공유 → <b>Dock에 추가</b></li>
        </ul>
      </>
    );
  }
  if (platform === "ios") {
    return (
      <>
        <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] rounded-[var(--radius-md)] px-2.5 py-2">
          App Store 전용 앱은 <b>준비 중</b>입니다. 지금은 홈 화면에 추가해 앱처럼 사용할 수 있어요.
        </p>
        <p className="leading-relaxed"><b>Safari</b>로 이 사이트를 연 뒤:</p>
        <ol className="list-decimal pl-5 space-y-1 text-[var(--gray-600)]">
          <li>하단 <b>공유 버튼</b> 탭</li>
          <li><b>홈 화면에 추가</b> 선택</li>
        </ol>
        <p className="text-xs text-[var(--muted)]">홈 화면 아이콘으로 앱처럼 실행됩니다.</p>
      </>
    );
  }
  return (
    <>
      <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] rounded-[var(--radius-md)] px-2.5 py-2">
        Google Play 전용 앱은 <b>준비 중</b>입니다. 지금은 브라우저에서 바로 앱으로 설치할 수 있어요.
      </p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--gray-600)]">
        <li><b>Chrome</b>: 메뉴(⋮) → <b>앱 설치</b> 또는 홈 화면에 추가</li>
      </ul>
    </>
  );
}
