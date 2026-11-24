"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import SubmitButton from "@/app/components/SubmitButton";
import { askScenarioCoach, type BriefDraft, type Turn } from "./coach-actions";
import { saveScenario } from "./actions";
import { ui } from "@/app/components/ui";
import HubDock from "./HubDock";
import Icon from "@/app/components/Icon";
import EviAvatar from "@/app/components/EviAvatar";

const items = [
  { key: "description", label: "서비스와 주 사용자", max: 1500 },
  { key: "task", label: "학생 과제", note: "혼자 10분 안에 끝낼 목표 하나", max: 1500 },
  { key: "outcome", label: "찾고 싶은 문제·개선점", max: 500 },
  { key: "metric", label: "완료 조건", note: "줄마다 하나, 학생이 예·아니오로 답함", max: 250 },
  { key: "version", label: "서비스 버전", max: 80 },
] as const;
const empty: BriefDraft = { description: "", task: "", outcome: "", metric: "", unit: "개", direction: "higher", version: "" };

export default function BriefInterview({ projectId, title, revision, initial, publish, next }: {
  projectId: string; title: string; revision: number; initial: BriefDraft | null; publish: ReactNode;
  /** 저장 뒤 이어서 할 일(작성 중 평가의 모집·비용 단계). 없으면 공개 대기 안내 */
  next?: ReactNode;
}) {
  const [draft, setDraft] = useState<BriefDraft>(initial ?? empty);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const log = useRef<HTMLDivElement>(null);
  const filledCount = items.filter(({ key }) => draft[key].trim()).length;
  const filled = filledCount === items.length;
  const changed = !initial || items.some(({ key }) => draft[key] !== initial[key]);
  const opening = initial
    ? "저장된 과제 내용이에요. 바꾸고 싶은 부분을 말해 주시면 고쳐 드릴게요."
    : `‘${title}’ 평가를 함께 준비할게요. 먼저 이 서비스가 무엇을 하는 서비스이고, 주로 누가 쓰는지 편하게 말해 주세요. 한 줄이어도 괜찮아요.`;

  // 저장 전 대화·정리본은 이 기기에 보관해 새로고침·다른 화면 이동 뒤에도 이어서 함. 저장해 판이 바뀌면 이전 판 기록 삭제
  const store = `brief:${projectId}:${revision}`;
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(`brief:${projectId}:`) && k !== store) localStorage.removeItem(k);
      }
      const saved = JSON.parse(localStorage.getItem(store) ?? "null") as { draft: BriefDraft; turns: Turn[] } | null;
      if (saved?.turns?.length) {
        // 기기 저장소는 서버 렌더에서 읽을 수 없어 마운트 후 복원
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTurns(saved.turns);
        setDraft(saved.draft);
      }
    } catch {}
  }, [projectId, store]);
  useEffect(() => {
    try {
      if (turns.length) localStorage.setItem(store, JSON.stringify({ draft, turns }));
    } catch {}
  }, [store, draft, turns]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // 답을 받는 동안 입력칸이 잠겨 초점이 빠지므로, 답이 오면 입력칸으로 돌려줌
  useEffect(() => {
    if (busy || !turns.length || document.activeElement !== document.body) return;
    document.getElementById(`brief-${projectId}`)?.focus({ preventScroll: true });
  }, [busy, turns.length, projectId]);

  function send() {
    const text = answer.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setAnswer("");
    setNotice("");
    start(async () => {
      try {
        const res = await askScenarioCoach(projectId, next.slice(-12), draft);
        if (!res.text) { setTurns(turns); setAnswer(text); setNotice(res.error ?? "다시 시도해 주세요."); return; }
        setTurns([...next, { role: "assistant", content: res.text }]);
        if (res.draft) setDraft({ ...res.draft, unit: "개", direction: "higher" });
      } catch { setTurns(turns); setAnswer(text); setNotice("연결이 끊겼어요. 다시 보내 주세요."); }
    });
  }

  return (
    <div className="space-y-5">
      <HubDock title={title} subtitle="학생 과제를 함께 정해요">
      <section aria-label="과제 인터뷰" className="flex h-[calc(100dvh-15rem)] min-h-[28rem] flex-col overflow-hidden rounded-[var(--radius-xl)] bg-white">
        <div className="flex min-h-14 items-center gap-3 border-b border-[var(--gray-100)] px-4 sm:px-6">
          <EviAvatar size={32} />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Evi</p>
            <p className="text-xs text-[var(--muted)]">{busy ? "정리하는 중…" : "몇 가지 질문으로 학생 과제를 함께 정해요"}</p>
          </div>
        </div>
        <div ref={log} role="log" aria-live="polite" aria-label="대화 기록" tabIndex={0} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--gray-50)] px-4 py-5 sm:px-6">
          {[{ role: "assistant", content: opening } as Turn, ...turns].map((t, i, all) => t.role === "user" ? (
            <p key={i} className={ui.bubbleMe}>{t.content}</p>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <EviAvatar size={28} className={all[i - 1]?.role === "assistant" ? "invisible" : ""} />
              <p className={ui.bubbleAiOnGray}>{t.content}</p>
            </div>
          ))}
          {busy && (
            <div className="flex items-start gap-2">
              <EviAvatar size={28} />
              <p className={`${ui.bubbleAiOnGray} inline-flex gap-1`} aria-label="정리하는 중">
                {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]" style={{ animationDelay: `${d}ms` }} />)}
              </p>
            </div>
          )}
        </div>
        <form className="space-y-2 border-t border-[var(--gray-100)] px-4 py-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {notice && <p role="status" className="text-sm text-[var(--danger)]">{notice}</p>}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor={`brief-${projectId}`}>답변</label>
            <textarea id={`brief-${projectId}`} className={`${ui.field} min-h-11 resize-none`} rows={2}
              maxLength={2000} value={answer} disabled={busy} onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder="편하게 답해 주세요" />
            <button className={ui.primary} disabled={busy || !answer.trim()} aria-label="보내기"><Icon name="send" size={16} /></button>
          </div>
        </form>
      </section>
      </HubDock>

      <aside className="space-y-4">
        <form action={saveScenario.bind(null, projectId)} className={`${ui.panel} space-y-5`}>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">정리된 과제 내용</h2>
              <span className="text-xs font-semibold tabular-nums text-[var(--accent)]">{filledCount}/{items.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--gray-100)]" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={filledCount} aria-label="채운 항목">
              <div className="h-1.5 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(filledCount / items.length) * 100}%` }} />
            </div>
          </div>
          <input type="hidden" name="op" value="draft" />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="direction" value="higher" />
          <input type="hidden" name="unit" value="개" />
          <dl className="divide-y divide-[var(--gray-100)]">
            {items.map((item) => {
              const { key, label, max } = item;
              const value = draft[key];
              return (
                <div key={key} className="space-y-1.5 py-3 first:pt-0">
                  <dt className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${value ? "bg-[var(--success)] text-white" : "bg-[var(--gray-100)]"}`}>
                        {value && <Icon name="check" size={12} />}
                      </span>
                      <span>{label}{"note" in item && <span className="font-normal"> · {item.note}</span>}</span>
                    </span>
                    <button type="button" className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline" onClick={() => setEditing(editing === key ? null : key)}>
                      {editing === key ? "완료" : "고치기"}
                    </button>
                  </dt>
                  <dd>
                    {editing === key ? (
                      <textarea className={`${ui.field} text-sm`} rows={key === "version" ? 1 : 4} maxLength={max}
                        value={value} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
                    ) : (
                      <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${value ? "" : "text-[var(--muted)]"}`}>
                        {value || "대화하면서 채워져요"}
                      </p>
                    )}
                    <input type="hidden" name={key} value={value} />
                  </dd>
                </div>
              );
            })}
          </dl>
          <SubmitButton className={`${ui.primary} w-full`} disabled={!filled || !changed}>
            {!filled ? "모든 항목이 채워지면 저장할 수 있어요" : changed ? "이대로 저장" : "저장됨"}
          </SubmitButton>
        </form>
        {initial && !changed && !publish && (next ?? (
          <p className={`${ui.panel} text-sm leading-relaxed`}>저장했어요. 운영진이 확인한 뒤 학생에게 공개해요.</p>
        ))}
        {publish && !changed && (
          <div className={`${ui.panel} space-y-3`}>
            <p className="text-sm leading-relaxed">저장한 내용은 아직 학생에게 보이지 않아요. 공개하면 과제와 완료 조건이 고정돼요.</p>
            {publish}
          </div>
        )}
      </aside>
    </div>
  );
}
