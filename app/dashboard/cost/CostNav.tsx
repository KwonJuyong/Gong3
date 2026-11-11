"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 비용 관리 탭. 가격 제시 문서는 견적서(/dashboard/orders)로 일원화했음
const TABS = [
  { href: "/dashboard/cost", label: "비용 대시보드" },
  { href: "/dashboard/cost/feedback", label: "피드백 분석" },
];

export default function CostNav() {
  const pathname = usePathname();
  return (
    <nav className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-6 flex items-center gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
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
  );
}
