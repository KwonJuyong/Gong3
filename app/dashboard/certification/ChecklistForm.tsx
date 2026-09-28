"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveCertReadinessAction } from "./actions";
import type { CertAnswer } from "@/app/lib/certChecklist";

// 조건부 문항(when)은 함수라 넘길 수 없어서 서버가 걸러낸 데이터만 받는다.
export type PlainItem = { id: string; q: string; why: string; basis: string };
export type PlainGroup = { id: string; title: string; note: string; items: PlainItem[] };

const CHOICES: { value: CertAnswer; label: string }[] = [
  { value: "yes", label: "예" },
  { value: "no", label: "아니오" },
  { value: "na", label: "해당 없음" },
];

export default function ChecklistForm({
  serviceId,
  groups,
  initialAnswers,
  initialNote,
}: {
  serviceId: string;
  groups: PlainGroup[];
  initialAnswers: Record<string, CertAnswer>;
  initialNote: string;
}) {
  const [answers, setAnswers] = useState<Record<string, CertAnswer>>(initialAnswers);
  const [note, setNote] = useState(initialNote);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<null | "ok" | string>(null);
  const [pending, startTransition] = useTransition();

  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // 점수 대신 미비·미응답 개수만 센다.
  const gaps = items.filter((it) => answers[it.id] === "no");
  const answered = items.filter((it) => answers[it.id]).length;

  // 저장하지 않은 답이 있을 때만 페이지를 떠나기 전에 확인한다.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pick = (id: string, v: CertAnswer) => {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    setDirty(true);
    setSaved(null);
  };

  const save = () => {
    startTransition(async () => {
      const r = await saveCertReadinessAction(serviceId, answers, note);
      setSaved(r.ok ? "ok" : r.error);
      if (r.ok) setDirty(false);
    });
  };

  return (
    <>
      {/* 진행 표시. 하단 고정 버튼들과 겹치지 않도록 머리글 아래에 붙인다. */}
      <div className="sticky top-14 z-30 -mx-6 px-6 py-2.5 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--gray-200)] flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)] tabular-nums">
          문항 {items.length}개 중 <b className="text-[var(--foreground)]">{answered}개</b> 응답
          {gaps.length > 0 && <> · 보완 필요 {gaps.length}개</>}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && <span className="text-xs text-[var(--warning)]">저장하지 않음</span>}
          {!dirty && saved === "ok" && (
            <span className="text-xs text-[var(--success)]">저장했습니다</span>
          )}
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="px-3.5 py-1.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-medium hover:bg-[var(--accent-dark)] disabled:opacity-40 transition-colors"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      <div className="space-y-6 pt-6">
        {groups.map((g) => (
          <section
            key={g.id}
            className="bg-white rounded-[var(--radius-xl)] p-6"
          >
            <div className="mb-5">
              <h3 className="text-base font-semibold text-[var(--foreground)]">{g.title}</h3>
              <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">{g.note}</p>
            </div>

            <div className="space-y-5">
              {g.items.map((it, i) => {
                const v = answers[it.id];
                return (
                  <div
                    key={it.id}
                    className={i > 0 ? "pt-5 border-t border-[var(--gray-100)]" : ""}
                  >
                    <p className="text-sm text-[var(--foreground)] leading-relaxed">{it.q}</p>
                    <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{it.why}</p>
                    <fieldset className="mt-3">
                      <legend className="sr-only">{it.q}</legend>
                      <div className="flex flex-wrap items-center gap-2">
                        {CHOICES.map((c) => {
                          const active = v === c.value;
                          return (
                            <label
                              key={c.value}
                              className={`text-xs px-3 py-2 rounded-[var(--radius-md)] border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-1 ${
                                active
                                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                  : "bg-white text-[var(--muted)] border-[var(--gray-200)] hover:border-[var(--gray-400)]"
                              }`}
                            >
                              <input
                                type="radio"
                                name={it.id}
                                value={c.value}
                                checked={active}
                                onChange={() => pick(it.id, c.value)}
                                className="sr-only"
                              />
                              {c.label}
                            </label>
                          );
                        })}
                        <span className="text-xs text-[var(--gray-500)] ml-auto">
                          {it.basis}
                        </span>
                      </div>
                    </fieldset>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* 결과: 미비 항목 목록 */}
        <section className="bg-white rounded-[var(--radius-xl)] p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-[var(--foreground)]">점검 결과</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              합격 여부를 판정하지 않습니다. 「아니오」로 답한 항목만 모아 보여줍니다.
            </p>
          </div>

          {gaps.length === 0 ? (
            <p className="text-sm text-[var(--gray-600)]">
              「아니오」로 표시한 항목이 없습니다.
              {answered < items.length && " 남은 문항에 답하면 목록이 정확해집니다."}
            </p>
          ) : (
            <ul className="space-y-2">
              {gaps.map((it) => (
                <li key={it.id} className="flex gap-2.5 text-sm text-[var(--gray-700)]">
                  <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
                  <span className="leading-relaxed">{it.q}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 pt-5 border-t border-[var(--gray-100)]">
            <label
              htmlFor="cert-note"
              className="block text-sm font-medium text-[var(--gray-700)] mb-2"
            >
              메모 <span className="text-[var(--muted)] font-normal">(선택)</span>
            </label>
            <textarea
              id="cert-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setDirty(true);
                setSaved(null);
              }}
              rows={3}
              maxLength={2000}
              placeholder="다음에 이어서 볼 때 필요한 내용을 적어 두세요."
              className="w-full rounded-[var(--radius-md)] border border-[var(--gray-200)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--gray-400)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--accent-dark)] disabled:opacity-50 transition-colors"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            {saved === "ok" && !dirty && (
              <span className="text-sm text-[var(--success)]">저장했습니다.</span>
            )}
            {saved && saved !== "ok" && (
              <span className="text-sm text-[var(--danger)]">{saved}</span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
