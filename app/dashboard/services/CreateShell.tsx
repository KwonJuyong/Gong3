import Link from "next/link";
import type { ReactNode } from "react";
import { ui } from "@/app/components/ui";

// 평가 만들기 공용 틀. 세 방식 어디서든 방식을 바로 바꾸고, 지나온 단계로 눌러서 돌아갈 수 있게 함

export type CreateMethod = "accompany" | "standard" | "free";

const METHODS: { key: CreateMethod; label: string; href: string }[] = [
  { key: "accompany", label: "Evi 동행 평가", href: "/dashboard/accompany/new" },
  { key: "standard", label: "표준 설문", href: "/dashboard/services?method=standard" },
  { key: "free", label: "자유 설문", href: "/dashboard?view=create" },
];

export const STEP_LABELS: Record<CreateMethod, string[]> = {
  accompany: ["평가 대상", "Evi 과제 인터뷰", "모집·비용", "승인 요청"],
  standard: ["서비스 등록", "표준 문항 확정", "모집·비용", "승인 요청"],
  free: ["문항 작성", "모집·비용", "검토·승인 요청"],
};

/** 지나온 단계로 가는 방법. 페이지 주소(href) 또는 같은 화면 안 이동(onClick) */
export type StepTarget = { href?: string; onClick?: () => void };

const withDate = (href: string, date?: string) => (date ? `${href}${href.includes("?") ? "&" : "?"}d=${encodeURIComponent(date)}` : href);

export function CreateNav({ method, step, targets = {}, date }: {
  method: CreateMethod;
  /** 지금 단계(1부터) */
  step: number;
  /** 단계 번호 → 이동 방법. 지나온 단계만 누를 수 있음 */
  targets?: Record<number, StepTarget>;
  date?: string;
}) {
  return (
    <div className="space-y-4">
      <nav aria-label="평가 방식" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={withDate("/dashboard/services", date)} className={ui.back}>
          <span aria-hidden="true">←</span> 평가 만들기
        </Link>
        <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-[var(--gray-100)] p-1">
          {METHODS.map((m) => m.key === method ? (
            <span key={m.key} aria-current="page" className="whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-[var(--foreground)] shadow-sm">
              {m.label}
            </span>
          ) : (
            <Link
              key={m.key}
              href={withDate(m.href, date)}
              className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              {m.label}
            </Link>
          ))}
        </div>
      </nav>
      <ol aria-label="만들기 단계" className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-2">
        {STEP_LABELS[method].map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const target = done ? targets[n] : undefined;
          const dot = (
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              n === step ? "bg-[var(--accent)] text-white" : done ? "bg-[var(--accent-light)] text-[var(--accent)]" : "bg-[var(--gray-100)] text-[var(--muted)]"
            }`}>{done ? "✓" : n}</span>
          );
          const text = <span className={`text-sm ${n === step ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"}`}>{label}</span>;
          const cls = "inline-flex min-h-9 items-center gap-2 rounded-full pr-2";
          return (
            <li key={label} aria-current={n === step ? "step" : undefined} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="hidden h-px w-4 bg-[var(--gray-300)] sm:block" />}
              {target?.href ? (
                <Link href={target.href} className={`${cls} hover:underline`}>{dot}{text}</Link>
              ) : target?.onClick ? (
                <button type="button" onClick={target.onClick} className={`${cls} hover:underline`}>{dot}{text}</button>
              ) : (
                <span className={cls}>{dot}{text}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 평가 만들기 화면 머리(방식 탭·단계·제목·안내)와 본문 */
export default function CreateShell({ method, step, targets, date, title, lead, children }: {
  method: CreateMethod;
  step: number;
  targets?: Record<number, StepTarget>;
  date?: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <CreateNav method={method} step={step} targets={targets} date={date} />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {lead && <p className={ui.hint}>{lead}</p>}
      </header>
      {children}
    </div>
  );
}
