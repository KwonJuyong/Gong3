"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 비용 관리 탭. 가격 제시 문서는 견적서(/dashboard/orders)로 일원화했다.
const TABS = [
  { href: "/dashboard/cost", label: "비용 대시보드" },
  { href: "/dashboard/cost/feedback", label: "피드백 분석" },
];

export default function CostNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[var(--gray-200)]">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 shrink-0">
          <img src="/logo.svg" alt="AI 평가단 로고" className="w-7 h-7" />
          <h1 className="text-base font-bold text-[var(--gray-900)]">AI 평가단</h1>
        </Link>
        <nav className="flex items-center gap-1 ml-2 overflow-x-auto">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-[var(--radius-md)] text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "text-[var(--gray-900)] font-semibold bg-[var(--gray-100)]"
                    : "text-[var(--muted)] hover:bg-[var(--gray-50)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/dashboard"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] whitespace-nowrap"
        >
          ← 대시보드
        </Link>
      </div>
    </header>
  );
}
