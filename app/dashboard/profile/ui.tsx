/** 프로필 화면 공용 컴포넌트. 서버·클라이언트 양쪽에서 쓰므로 "use client" 를 붙이지 않는다. */

export const INPUT =
  "w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

export const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--gray-700)] text-sm font-medium hover:bg-[var(--gray-50)] transition-colors";

/** 섹션 카드 — 제목 + 설명 + 본문 */
export function Card({
  title,
  desc,
  aside,
  children,
}: {
  title: string;
  desc?: React.ReactNode;
  /** 제목 줄 오른쪽 (상태 배지 등) */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
          {desc && <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{desc}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** 라벨 + 입력칸 한 줄 */
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-[var(--gray-600)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[var(--muted)] mt-1 leading-snug">{hint}</span>}
    </label>
  );
}

export type BadgeTone = "success" | "warning" | "danger" | "muted";

const BADGE: Record<BadgeTone, string> = {
  success: "bg-[var(--success-light)] text-[var(--success)]",
  warning: "bg-[var(--warning-light)] text-[var(--warning)]",
  danger: "bg-[var(--danger-light)] text-[var(--danger)]",
  muted: "bg-[var(--gray-100)] text-[var(--gray-500)]",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

/** 안내·경고 줄 */
export function Note({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const cls: Record<BadgeTone, string> = {
    success: "bg-[var(--success-light)] text-[var(--success)]",
    warning: "bg-[var(--warning-light)] text-[var(--warning)]",
    danger: "bg-[var(--danger-light)] text-[var(--danger)]",
    muted: "bg-[var(--gray-50)] text-[var(--muted)]",
  };
  return (
    <p className={`text-xs leading-relaxed px-3 py-2.5 rounded-[var(--radius-md)] ${cls[tone]}`}>
      {children}
    </p>
  );
}
