"use client";

import { useEffect, useState } from "react";
import {
  getDemoAccountsAction,
  type DemoAccountGroup,
} from "../staging-actions";

/**
 * 로그인 화면의 스테이징 계정 안내. SHOW_DEMO_ACCOUNTS=true 일 때만 서버 액션이 목록을 돌려줌
 *
 * - 로그인 카드 위치가 바뀌지 않도록 레이아웃 흐름 밖(fixed)에 둠
 *   left-[calc(50%_+_252px)] = 카드 절반(220) + 여백(32). 가입 화면처럼 카드가 길어져도
 *   화면 기준으로 가운데에 오도록 absolute 대신 fixed 를 씀
 * - 패널 오른쪽 끝이 50vw + 632px 이라 1320px 이상에서만 옆에 두고,
 *   그보다 좁으면 compact(카드 아래 접힌 목록)를 씀. 두 기준은 서로 반대로 맞춤
 *   폭이나 여백을 바꾸면 이 숫자들도 함께 고침
 */
export default function DemoAccountsPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [groups, setGroups] = useState<DemoAccountGroup[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    // 실패해도 로그인 화면에 영향이 없도록 무시함
    getDemoAccountsAction()
      .then(setGroups)
      .catch(() => setGroups(null));
  }, []);

  if (!groups) return null;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
      },
      () => {},
    );
  };

  const list = (
    <>
      {groups.map((g) => (
        <section key={g.title} className="py-2">
          <div className="flex items-center justify-between gap-2 px-5 pt-2 pb-1.5">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[var(--gray-900)]">
                {g.title}
              </h3>
              <p className="text-xs text-[var(--muted)]">{g.caption}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(g.password)}
              title="비밀번호 복사"
              className="shrink-0 rounded-[10px] bg-[var(--gray-100)] px-2.5 py-1 font-mono text-xs text-[var(--gray-700)] transition-colors hover:bg-[var(--gray-200)]"
            >
              {copied === g.password ? "복사됨" : g.password}
            </button>
          </div>

          <ul>
            {g.rows.map((r) => (
              <li key={r.email}>
                <button
                  type="button"
                  onClick={() => copy(r.email)}
                  className="flex w-full items-center gap-3 px-5 py-1.5 text-left transition-colors hover:bg-[var(--gray-50)]"
                >
                  <span className="w-[52px] shrink-0 whitespace-nowrap text-xs font-semibold text-[var(--gray-500)]">
                    {r.role}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] text-[var(--gray-900)]">
                      {copied === r.email ? "복사됨" : r.email}
                    </span>
                    <span className="block truncate text-xs text-[var(--muted)]">
                      {r.name} · {r.desc}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
  const footnote = (
    <>
      항목을 누르면 복사됩니다. 로그인 ID 는{" "}
      <b className="text-[var(--gray-700)]">이메일</b>입니다.
    </>
  );

  // 좁은 화면: 카드 아래 접힌 목록. 옆 패널과 같은 내용임
  if (compact) {
    return (
      <details className="min-[1320px]:hidden mt-4 rounded-[var(--radius-xl)] bg-white overflow-hidden group">
        <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center rounded-full bg-[var(--warning-light)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
            테스트 환경
          </span>
          <span className="text-sm font-semibold text-[var(--gray-900)] flex-1">
            시연용 계정 보기
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--gray-500)] transition-transform group-open:rotate-180"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="divide-y divide-[var(--gray-100)] border-t border-[var(--gray-100)]">
          {list}
        </div>
        <p className="border-t border-[var(--gray-100)] px-5 py-3 text-xs text-[var(--muted)]">
          {footnote}
        </p>
      </details>
    );
  }

  return (
    <aside className="hidden min-[1320px]:block fixed top-1/2 -translate-y-1/2 left-[calc(50%_+_252px)] w-[380px]">
      <div className="rounded-[var(--radius-xl)] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--warning-light)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
              테스트 환경
            </span>
            <h2 className="text-[15px] font-bold text-[var(--gray-900)]">
              시연용 계정
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
            아래 계정은 더미이며 실제 개인정보·거래는 들어 있지 않습니다.
          </p>
        </div>

        <div className="max-h-[62vh] overflow-y-auto divide-y divide-[var(--gray-100)]">
          {list}
        </div>

        <p className="border-t border-[var(--gray-100)] px-5 py-3 text-xs text-[var(--muted)]">
          {footnote}
        </p>
      </div>
    </aside>
  );
}
