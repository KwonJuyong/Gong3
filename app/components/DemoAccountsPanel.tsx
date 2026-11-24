"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDemoAccountsAction,
  type DemoAccountsPayload,
} from "../staging-actions";

// SHOW_DEMO_ACCOUNTS=true 환경에서만 표시(1320px 이상은 고정 옆 패널, 미만은 접힌 목록)
export default function DemoAccountsPanel({
  compact = false,
  activeEmail,
  onSelect,
}: {
  compact?: boolean;
  activeEmail?: string;
  onSelect: (email: string, password: string) => void;
}) {
  const [data, setData] = useState<DemoAccountsPayload | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // 실패해도 로그인 화면에 영향이 없도록 무시함
    getDemoAccountsAction()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const pick = (email: string) => {
    onSelect(email, data.password);
    if (compact && detailsRef.current) detailsRef.current.open = false;
  };

  const body = (
    <div className="divide-y divide-[var(--gray-100)]">
      <div className="px-5 py-3">
        <p className="text-xs font-semibold text-[var(--muted)] mb-2">관리자 · 기업</p>
        <ul className="space-y-1">
          {data.primary.map((r) => {
            const selected = activeEmail === r.email;
            return (
              <li key={r.email}>
                <button
                  type="button"
                  onClick={() => pick(r.email)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[var(--accent-light)] text-[var(--accent)] font-semibold"
                      : "text-[var(--foreground)] hover:bg-[var(--gray-50)]"
                  }`}
                >
                  <span className="shrink-0 font-medium">{r.name}</span>
                  <span className="truncate font-mono text-xs text-[var(--muted)]">{r.email}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-5 py-3.5">
        <div className="flex items-baseline justify-between mb-2.5">
          <p className="text-xs font-semibold text-[var(--muted)]">학생 ({data.students.length})</p>
          <span className="font-mono text-xs text-[var(--muted)]">student1~{data.students.length}@example.com</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {data.students.map((r) => {
            const selected = activeEmail === r.email;
            return (
              <button
                key={r.email}
                type="button"
                onClick={() => pick(r.email)}
                aria-pressed={selected}
                title={r.email}
                className={`rounded-[var(--radius-md)] py-2 text-center text-xs transition-colors ${
                  selected
                    ? "bg-[var(--accent-light)] text-[var(--accent)] font-semibold"
                    : "bg-[var(--gray-50)] text-[var(--gray-700)] hover:bg-[var(--gray-100)]"
                }`}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--gray-100)] px-5 py-3 text-xs text-[var(--muted)]">
      <span>계정을 누르면 바로 채워져요</span>
      <span className="font-mono text-[var(--gray-700)]">PW {data.password}</span>
    </div>
  );

  // 좁은 화면: 카드 아래 접힌 목록. 옆 패널과 같은 내용임
  if (compact) {
    return (
      <details
        ref={detailsRef}
        className="min-[1320px]:hidden mt-4 rounded-[var(--radius-xl)] bg-white overflow-hidden group"
      >
        <summary className="flex items-center justify-between gap-2 px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-[var(--foreground)]">테스트 계정 선택</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="border-t border-[var(--gray-100)]">{body}</div>
        {footer}
      </details>
    );
  }

  return (
    <aside
      aria-label="테스트 계정"
      className="hidden min-[1320px]:block fixed top-1/2 -translate-y-1/2 left-[calc(50%_+_252px)] w-[360px]"
    >
      <div className="rounded-[var(--radius-xl)] bg-white overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-[var(--gray-100)] px-5 py-4">
          <h2 className="text-base font-bold text-[var(--foreground)]">테스트 계정</h2>
          <span className="text-xs text-[var(--muted)]">스테이징 전용</span>
        </div>
        {body}
        {footer}
      </div>
    </aside>
  );
}
