"use client";

import { useEffect, useState } from "react";

/**
 * 응답 화면 제목 아래의 「평가할 서비스」 링크 줄.
 *
 * 줄 전체가 링크이고 주소는 도메인만 보여준다(전체 주소는 title).
 * 「이 화면 옆에 띄우기」는 /api/frame-check 가 iframe 표시가 가능하다고 확인한 경우에만 보인다.
 */
export default function EvalServiceLink({
  projectId,
  link,
  split,
  onSplit,
}: {
  projectId: string;
  link: string;
  /** 분할 화면이 열려 있으면 짧은 안내 한 줄만 보인다(서비스는 이미 옆에 떠 있다). */
  split: boolean;
  onSplit: () => void;
}) {
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/frame-check?p=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setEmbeddable(d?.embeddable ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (split) {
    return (
      <p className="mb-4 text-sm text-[var(--gray-700)]">
        오른쪽 화면이 평가할 서비스입니다. 써 보면서 아래 문항에 답해 주세요.
      </p>
    );
  }

  let host = link;
  try {
    host = new URL(link).host;
  } catch {
    /* 형식이 이상한 주소는 그대로 보여준다 */
  }

  return (
    <div className="mt-4 mb-6">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={link}
        className="group flex items-center gap-3 p-3 sm:p-3.5 rounded-[var(--radius-lg)] bg-[var(--gray-100)] hover:bg-[var(--gray-200)] transition-colors"
      >
        <span className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] bg-white text-[var(--accent)]" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-[var(--muted)]">먼저 평가할 서비스를 써 보세요</span>
          <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">{host}</span>
        </span>
        <span className="shrink-0 flex items-center gap-1 text-sm font-semibold px-3.5 py-2 rounded-[10px] bg-[var(--accent)] text-white group-hover:bg-[var(--accent-dark)] transition-colors">
          열기
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </span>
      </a>
      <p className="mt-2 px-1 text-xs text-[var(--muted)] leading-relaxed">
        새 탭에서 열립니다. 써 본 뒤 이 화면으로 돌아와 답해 주세요.
        {/* 화면 분할은 넓은 화면에서만 */}
        {embeddable === true && (
          <button
            type="button"
            onClick={onSplit}
            className="hidden lg:inline ml-2 font-medium text-[var(--gray-700)] underline underline-offset-2 hover:text-[var(--foreground)]"
          >
            이 화면 옆에 띄우기
          </button>
        )}
      </p>
    </div>
  );
}
