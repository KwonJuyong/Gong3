"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { submitResponseAction } from "./actions";
import { questionKey, MAX_TEXT_ANSWER } from "../lib/projectQuestions";
import { Likert5Field, Semantic7Field, ScaleField, StarRating, ImageUploadField } from "./EvalFields";
import SubmitButton from "../components/SubmitButton";

/**
 * 평가 응답 화면.
 *
 * - 상단에 응답한 문항 수를 표시해 비어 있는 문항을 알려줌
 * - 작성 중인 응답은 이 기기의 localStorage 에만 임시 저장하고, 제출하면 지움(공용 PC 대비).
 * - 빈 문항은 제출 시 문항 옆에 표시하고 첫 빈 문항으로 이동함
 * - 응답 키는 서버·리포트와 같은 questionKey() 로 만듦
 * - 필수 여부는 화면에서만 검사함(이미지·개선 의견은 선택).
 */

type AnyQ = {
  type: string;
  label: string;
  options?: string[];
  itemKey?: string;
  section?: string;
  sectionHint?: string;
  leftLabel?: string;
  rightLabel?: string;
  scaleMin?: number;
  scaleMax?: number;
  comment?: boolean;
};

const draftKey = (projectId: string, userId: string) => `eval-draft:${projectId}:${userId}`;

function readDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, v: Record<string, unknown> | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    /* 사생활 보호 모드 등: 임시 저장은 편의 기능이라 조용히 넘어감 */
  }
}

/** 폼의 answer_* 값을 `{ questionKey: 값 }` 으로 모음(서버 저장 형식과 같음). */
function collect(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, val] of new FormData(form).entries()) {
    if (!name.startsWith("answer_") || typeof val !== "string") continue;
    const k = name.slice("answer_".length);
    const cur = out[k];
    if (cur === undefined) out[k] = val;
    else if (Array.isArray(cur)) cur.push(val);
    else out[k] = [cur, val];
  }
  return out;
}

function isAnswered(q: AnyQ, v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.trim() !== "";
}
const isRequired = (q: AnyQ) => q.type !== "image";

export default function EvalForm({
  project,
  userId,
  questions,
  prevAnswers,
  alreadyAnswered,
  stickyTop,
  intro,
}: {
  project: { id: string; title: string; location?: string };
  userId: string;
  questions: AnyQ[];
  prevAnswers: Record<string, unknown>;
  alreadyAnswered: boolean;
  /** 진행 막대가 붙을 위치. 일반 화면은 공용 머리글(56px) 아래, 분할 화면은 0. */
  stickyTop: string;
  /** 제목 아래, 문항 앞에 보일 내용(평가할 서비스 링크) */
  intro?: ReactNode;
}) {
  const key = draftKey(project.id, userId);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(prevAnswers);
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // 폼은 비제어(defaultValue)라 임시 저장을 불러오거나 지울 때 다시 그려야 값이 바뀜
  const [formVersion, setFormVersion] = useState(0);

  useEffect(() => {
    const d = readDraft(key);
    setDraft(d);
    if (d) setValues({ ...prevAnswers, ...d });
    setLoaded(true);
    // prevAnswers 는 서버에서 온 고정값이라 키가 바뀔 때만 다시 읽음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const initial = useMemo(() => ({ ...prevAnswers, ...(draft ?? {}) }), [prevAnswers, draft]);
  const keys = useMemo(() => questions.map((q, i) => questionKey(q as never, i)), [questions]);
  const requiredIdx = useMemo(() => questions.map((q, i) => (isRequired(q) ? i : -1)).filter((i) => i >= 0), [questions]);
  const answeredCount = requiredIdx.filter((i) => isAnswered(questions[i], values[keys[i]])).length;

  const sync = useCallback(() => {
    const f = formRef.current;
    if (!f) return;
    const v = collect(f);
    setValues(v);
    setMissing((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const i of prev) if (isAnswered(questions[i], v[keys[i]])) next.delete(i);
      return next;
    });
    writeDraft(key, v);
    setSavedAt(Date.now());
  }, [key, keys, questions]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const v = collect(e.currentTarget);
    const miss = requiredIdx.filter((i) => !isAnswered(questions[i], v[keys[i]]));
    if (miss.length > 0) {
      e.preventDefault();
      setMissing(new Set(miss));
      const el = document.getElementById(`q-${miss[0]}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
      return;
    }
    // 공용 PC 에 응답을 남기지 않음
    writeDraft(key, null);
  }

  function clearDraft() {
    writeDraft(key, null);
    setDraft(null);
    setValues(prevAnswers);
    setSavedAt(null);
    setMissing(new Set());
    setFormVersion((n) => n + 1);
  }

  const total = requiredIdx.length;
  const pct = total ? Math.round((answeredCount / total) * 100) : 100;

  return (
    <>
      <h1 className="text-xl font-bold text-[var(--foreground)] mb-1">{project.title}</h1>
      {project.location && <p className="text-sm text-[var(--muted)] mb-3">{project.location}</p>}
      {intro}

      {alreadyAnswered && (
        <p className="text-sm text-[var(--gray-700)] bg-[var(--accent-light)] px-3 py-2 rounded-[var(--radius-md)] mb-3">
          이미 제출한 평가입니다. 내용을 고쳐 다시 제출할 수 있습니다.
        </p>
      )}
      {loaded && draft && (
        <p className="text-sm text-[var(--gray-700)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>이 기기에 임시 저장된 응답을 불러왔습니다.</span>
          <button type="button" onClick={clearDraft} className="underline font-medium">
            임시 저장 지우기
          </button>
        </p>
      )}

      {/* 응답 수(스크롤해도 보이도록 고정) */}
      <div className={`sticky ${stickyTop} z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 py-2.5 bg-white/95 backdrop-blur border-b border-[var(--gray-100)] mb-6`}>
        <div className="flex items-center justify-between text-xs text-[var(--gray-700)] mb-1.5">
          <span>
            응답 <strong className="text-[var(--foreground)] tabular-nums">{answeredCount}</strong> / {total}문항
          </span>
          <span className="text-[var(--muted)]">{savedAt ? "이 기기에 임시 저장됨" : "작성 내용은 이 기기에 임시 저장됩니다"}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--gray-100)] overflow-hidden" aria-hidden="true">
          <div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <form
        key={`${loaded ? "loaded" : "initial"}-${formVersion}`}
        ref={formRef}
        action={submitResponseAction}
        noValidate
        onChange={sync}
        onSubmit={onSubmit}
        className="space-y-8"
      >
        <input type="hidden" name="projectId" value={project.id} />

        {questions.map((q, i) => {
          const k = keys[i];
          const prev = initial[k];
          const prevArr = Array.isArray(prev) ? (prev as string[]) : prev != null ? [String(prev)] : [];
          // 구획이 바뀌는 첫 문항에만 제목을 그림(설문 원본 문항만 구획을 가짐).
          const prevSection = i > 0 ? questions[i - 1]?.section : undefined;
          const newSection = q.section && q.section !== prevSection ? q.section : null;
          const err = missing.has(i);
          const name = `answer_${k}`;
          const num = Number(prev);

          return (
            <div key={k} className="space-y-3">
              {newSection && (
                <div className="pt-3 pb-1.5 border-b border-[var(--gray-200)]">
                  <h2 className="text-base font-semibold text-[var(--foreground)]">{newSection}</h2>
                  {q.sectionHint && <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">{q.sectionHint}</p>}
                </div>
              )}
              <fieldset
                id={`q-${i}`}
                aria-invalid={err || undefined}
                className={`scroll-mt-32 space-y-3 rounded-[var(--radius-lg)] ${err ? "ring-2 ring-[var(--danger)] ring-offset-4" : ""}`}
              >
                <legend className="w-full">
                  <span className="flex items-start gap-2 text-[15px] font-semibold text-[var(--foreground)] leading-relaxed">
                    <span className="w-6 h-6 shrink-0 bg-[var(--gray-100)] text-[var(--gray-700)] rounded-[var(--radius-sm)] flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </span>
                    {q.type === "semantic7" ? (
                      <span className="flex-1 sr-only">
                        {q.leftLabel}과 {q.rightLabel} 중 어느 쪽에 가까운가요?
                      </span>
                    ) : (
                      <span className="flex-1">{q.label}</span>
                    )}
                    {!isRequired(q) && <span className="text-xs text-[var(--muted)] shrink-0">선택</span>}
                  </span>
                </legend>

                {q.type === "rating" && <StarRating name={name} defaultValue={num || undefined} onPick={sync} />}
                {q.type === "likert5" && <Likert5Field name={name} defaultValue={num || undefined} onPick={sync} />}
                {q.type === "semantic7" && (
                  <Semantic7Field name={name} left={q.leftLabel || ""} right={q.rightLabel || ""} defaultValue={num || undefined} onPick={sync} />
                )}
                {q.type === "scale" && (
                  <ScaleField
                    name={name}
                    min={q.scaleMin ?? 1}
                    max={q.scaleMax ?? 7}
                    left={q.leftLabel || ""}
                    right={q.rightLabel || ""}
                    // 0점이 유효한 척도라 빈 값과 0을 구분함
                    defaultValue={prev != null && prev !== "" && Number.isFinite(num) ? num : undefined}
                    onPick={sync}
                  />
                )}
                {/* 드롭다운도 폰에서 고르기 쉽도록 같은 값을 보내는 라디오 목록으로 그림 */}
                {(q.type === "dropdown" || q.type === "checkbox") && (
                  <div className="space-y-2">
                    {(q.options || []).map((opt, idx) => (
                      <label
                        key={idx}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-md)] bg-[var(--gray-100)] cursor-pointer hover:bg-[var(--gray-200)] has-[:checked]:bg-[var(--accent-light)] has-[:checked]:text-[var(--accent)] transition-colors"
                      >
                        <input
                          type={q.type === "dropdown" ? "radio" : "checkbox"}
                          name={name}
                          value={opt}
                          defaultChecked={prevArr.includes(opt)}
                          className="w-4 h-4 accent-[var(--accent)]"
                        />
                        <span className="text-sm text-[var(--foreground)]">{opt}</span>
                      </label>
                    ))}
                    {q.type === "checkbox" && <p className="text-xs text-[var(--muted)]">해당하는 것을 모두 고르세요 (1개 이상)</p>}
                  </div>
                )}
                {q.type === "image" && (
                  <ImageUploadField name={name} defaultValue={typeof prev === "string" ? prev : undefined} onPick={sync} />
                )}
                {q.type === "text" && (
                  <textarea
                    name={name}
                    defaultValue={prev != null ? String(prev) : ""}
                    rows={4}
                    maxLength={MAX_TEXT_ANSWER}
                    className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm resize-y outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                  />
                )}

                {err && (
                  <p className="text-sm text-[var(--danger)]" role="alert">
                    {q.type === "checkbox" ? "1개 이상 골라 주세요." : "이 문항에 응답해 주세요."}
                  </p>
                )}

                {/* 개선 의견(선택) */}
                {q.comment && q.itemKey && (
                  <input
                    name={`answer_text:${q.itemKey}`}
                    placeholder="개선 의견 (선택)"
                    aria-label={`${i + 1}번 문항 개선 의견 (선택)`}
                    defaultValue={String(initial[`text:${q.itemKey}`] ?? "")}
                    maxLength={MAX_TEXT_ANSWER}
                    className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] transition-colors"
                  />
                )}
              </fieldset>
            </div>
          );
        })}

        <div className="pt-2">
          {missing.size > 0 && (
            <p className="text-sm text-[var(--danger)] mb-2" role="alert">
              응답하지 않은 문항이 {missing.size}개 있습니다. 표시된 문항을 확인해 주세요.
            </p>
          )}
          <SubmitButton
            pendingText="제출 중…"
            className="w-full py-3 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
          >
            {alreadyAnswered ? "고친 내용으로 다시 제출" : "제출하기"}
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
