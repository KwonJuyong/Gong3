"use client";

import type { Dispatch, SetStateAction } from "react";
import type { DraftQuestion, QType } from "./dashboardTypes";

const ICON_BTN =
  "w-10 h-10 shrink-0 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:bg-[var(--gray-50)] disabled:opacity-40 disabled:cursor-not-allowed";

export default function DashboardQuestionBuilder({
  qs,
  setQs,
  htmlRequired = true,
}: {
  qs: DraftQuestion[];
  setQs: Dispatch<SetStateAction<DraftQuestion[]>>;
  htmlRequired?: boolean;
}) {
  const move = (i: number, d: -1 | 1) =>
    setQs((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">평가문항</h3>
        <span className="text-xs text-[var(--muted)]">{qs.length}개</span>
      </div>

      {qs.map((q, i) => (
        <div key={i} className="space-y-2 border-t border-[var(--gray-200)] pt-4">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs font-semibold text-[var(--muted)] shrink-0 text-center">{i + 1}</span>
            <input
              name={`q_label_${i}`}
              value={q.label}
              onChange={(e) => {
                const v = e.target.value;
                setQs((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: v } : x)));
              }}
              placeholder="질문을 입력하세요"
              aria-label={`${i + 1}번 문항 질문`}
              required={htmlRequired}
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
            />
          </div>

          <div className="flex gap-2 pl-8">
            <select
              name={`q_type_${i}`}
              value={q.type}
              aria-label={`${i + 1}번 문항 응답 방식`}
              onChange={(e) => {
                const v = e.target.value as QType;
                setQs((prev) => prev.map((x, idx) => (idx === i ? { ...x, type: v } : x)));
              }}
              className="min-w-0 flex-1 sm:max-w-xs px-3 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
            >
              <option value="rating">별점 (1~5)</option>
              <option value="likert5">동의 척도 (5점)</option>
              <option value="text">서술형</option>
              <option value="dropdown">보기 중 1개 선택</option>
              <option value="checkbox">보기 중 여러 개 선택</option>
              <option value="image">이미지 업로드</option>
            </select>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 문항 위로`} className={ICON_BTN}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label={`${i + 1}번 문항 아래로`} className={ICON_BTN}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setQs((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={qs.length <= 1}
              aria-label={`${i + 1}번 문항 삭제`}
              title={qs.length <= 1 ? "문항은 1개 이상 있어야 합니다" : "삭제"}
              className={`${ICON_BTN} hover:text-[var(--danger)] hover:border-[var(--danger)]`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </div>

          {(q.type === "dropdown" || q.type === "checkbox") && (
            <div className="pl-8">
              <textarea
                name={`q_options_${i}`}
                value={q.optionsText}
                aria-label={`${i + 1}번 문항 보기 (한 줄에 하나)`}
                onChange={(e) => {
                  const v = e.target.value;
                  setQs((prev) => prev.map((x, idx) => (idx === i ? { ...x, optionsText: v } : x)));
                }}
                placeholder={"보기를 한 줄에 하나씩 입력\n예) 매우 좋음\n좋음\n보통\n나쁨"}
                required={htmlRequired}
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm h-24 resize-y outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => setQs((prev) => [...prev, { label: "", type: "text", optionsText: "" }])}
        className="w-full py-3 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] text-sm font-medium text-[var(--gray-700)] hover:bg-[var(--gray-50)] hover:border-[var(--gray-500)] transition-colors"
      >
        + 문항 추가
      </button>
    </div>
  );
}
