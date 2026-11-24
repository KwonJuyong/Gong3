import type { ReactNode } from "react";
import { ui } from "./components/ui";

export const INPUT =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
export const LABEL = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";
export const BTN_PRIMARY = `${ui.primary} w-full`;

export const Req = () => <span className="text-[var(--danger)]">*</span>;

export function ChoiceCard({
  label,
  desc,
  icon,
  onClick,
}: {
  label: string;
  desc: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left p-3 sm:p-3.5 rounded-[var(--radius-lg)] bg-[var(--gray-100)] hover:bg-[var(--gray-200)] transition-colors"
    >
      <span
        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] bg-white text-[var(--gray-700)]"
        aria-hidden
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--gray-900)]">{label}</span>
        <span className="block text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">{desc}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--gray-500)]" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["유형 선택", "정보 입력", "이메일 인증"];
  return (
    <ol className="flex items-center gap-1.5 mb-5" aria-label="회원가입 단계">
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < current;
        const now = n === current;
        return (
          <li key={l} className="flex items-center gap-1.5 min-w-0" aria-current={now ? "step" : undefined}>
            <span
              className={`shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                now
                  ? "bg-[var(--accent)] text-white"
                  : done
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "bg-[var(--gray-100)] text-[var(--gray-500)]"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span
              className={`text-xs truncate ${
                now ? "font-semibold text-[var(--gray-900)]" : "text-[var(--gray-500)]"
              }`}
            >
              {l}
            </span>
            {i < labels.length - 1 && (
              <span className="w-3 h-px bg-[var(--gray-200)] shrink-0 ml-0.5" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold text-[var(--gray-500)] mb-2">{title}</legend>
      {children}
    </fieldset>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "text-[var(--danger)] bg-[var(--danger-light)]"
      : tone === "success"
        ? "text-[var(--success)] bg-[var(--success-light)]"
        : "text-[var(--gray-700)] bg-[var(--gray-100)]";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`text-sm px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed ${cls}`}
    >
      {children}
    </div>
  );
}
