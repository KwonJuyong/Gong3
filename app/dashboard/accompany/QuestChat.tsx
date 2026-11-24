"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CheckAnswer } from "@/app/lib/scenario";
import { askScenarioCoach, type Turn } from "./coach-actions";
import { saveScenario } from "./actions";
import { ui } from "@/app/components/ui";
import Icon from "@/app/components/Icon";
import EviAvatar from "@/app/components/EviAvatar";
import { normalizeUploadFile } from "@/app/lib/projectGuides";

type Msg = { from: "npc" | "me"; text: string };
type Step =
  | { kind: "usual" } | { kind: "predict"; i: number } | { kind: "value" } | { kind: "ease" }
  | { kind: "start" } | { kind: "free" } | { kind: "stuck" } | { kind: "check"; i: number }
  | { kind: "request" } | { kind: "confirm"; draft: string } | { kind: "images" };
type Shot = { url: string; name: string };
type State = { mode: string; log: Msg[]; step: Step; checks: CheckAnswer[]; rating: number; note: string; notes: string[]; images: Shot[]; value: string; nudges: number; undo: State[] };

const CHECK_IN_MS = 3 * 60 * 1000;
const MAX_NOTES = 10;
const MAX_IMAGES = 10;
const ASK_IMAGES = "마지막으로 하나만 여쭤볼게요. 개발사가 참고할 만한 화면 캡처가 있으면 올려 주세요. 여러 장 올려도 되고, 없으면 바로 마치면 돼요. 이름이나 연락처가 보이는 부분은 가리고 올려 주세요.";
const choice: Record<"predict" | "check", [CheckAnswer, string][]> = {
  predict: [["yes", "할 수 있을 것 같아요"], ["no", "어려울 것 같아요"], ["unknown", "모르겠어요"]],
  check: [["yes", "됐어요"], ["no", "안 됐어요"], ["unknown", "확인 못 했어요"]],
};
const progress = ["하는 중이에요", "막혔어요", "다 했어요"];
// 평소 방법 빠른 답. 서비스 종류와 무관하게 쓸 수 있는 방법만(직접 입력도 가능)
const usualChoices = ["검색해 봐요", "교재·강의 자료를 봐요", "친구·선배에게 물어봐요", "다른 앱을 써요", "따로 안 해요"];
// 답의 뜻을 색으로도 구분(예는 초록, 아니오는 빨강, 모름은 회색). 글자도 함께 표시
const tone: Record<CheckAnswer, string> = {
  yes: "bg-[var(--success-light)] text-[var(--success)] ring-[var(--success-light)] hover:ring-[var(--success)]",
  no: "bg-[var(--danger-light)] text-[var(--danger)] ring-[var(--danger-light)] hover:ring-[var(--danger)]",
  unknown: "bg-white ring-[var(--gray-200)] hover:ring-[var(--accent)]",
};

export default function QuestChat({ userId, projectId, briefKey, phase, running, task, items, unit, link, incident, readingId }: {
  userId: string; projectId: string; briefKey: string; phase: number | null; running: boolean; task: string; items: string[]; unit: string;
  link: string | null; incident: string | null; readingId: string | null;
}) {
  const before = phase === 0;
  const mode = phase === null ? "done" : before ? "before" : running ? "running" : "start";
  // 공개한 과제가 바뀌면 이전 대화를 이어 붙이지 않음
  const storeKey = `quest:${userId}:${projectId}:${briefKey}`;
  const checklist = items.length > 1;
  const conditions = items.map((item, i) => `${i + 1}. ${item}`).join("\n");

  // 단계가 바뀌어도 앞 대화를 이어 붙이도록 과제 소개는 처음 한 번만
  function opening(continued = false): State {
    const quest: Msg[] = continued ? [] : [{ from: "npc", text: `오늘 해 볼 과제예요.\n\n${task}` }];
    const base = { mode, checks: [], rating: 0, note: "", notes: [], images: [], value: "", nudges: 0, undo: [] };
    if (mode === "before") return { ...base, step: { kind: "usual" }, log: [...quest,
      { from: "npc", text: "출발 전에 몇 가지만 물어볼게요. 지금은 이런 일을 보통 어떻게 해요?" },
    ] };
    if (mode === "start") return { ...base, step: { kind: "start" }, log: [...quest,
      { from: "npc", text: "준비 끝! ‘과제 시작’을 누르면 서비스가 열리고 시작 시각이 기록돼요. 넓은 화면에서는 이 대화 옆에 열려요." },
    ] };
    if (mode === "running") return { ...base, step: { kind: "free" }, log: [...quest,
      { from: "npc", text: "과제 진행 중이에요. 어떻게 돼 가요?" },
    ] };
    return { ...base, step: { kind: "free" }, log: [...quest,
      { from: "npc", text: "과제를 마쳤어요. 참여가 기록됐어요. 남긴 요청에 개발사가 답하면 알림으로 알려 드릴게요. 나중에 떠오른 아쉬운 점이 있으면 언제든 남겨 주세요." },
    ] };
  }

  const [state, setState] = useState<State>(opening);
  // 마운트 직후의 첫 상태는 저장하지 않음(복원 전에 덮어쓰면 앞 단계 대화가 사라짐)
  const [fresh] = useState(state);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  // 학생이 글로 답하던 중이면 응답 뒤 입력칸으로 초점을 돌려줌
  const typedRef = useRef(false);
  const sending = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { log, step } = state;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storeKey);
      const prev: State | null = saved ? JSON.parse(saved) : null;
      const next = prev && (prev.mode === mode ? prev : { ...opening(true), log: [...prev.log, ...opening(true).log] });
      // 세션 저장소는 서버 렌더에서 읽을 수 없어 마운트 후 복원
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (next) setState(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  useEffect(() => {
    try { if (state !== fresh) sessionStorage.setItem(storeKey, JSON.stringify(state)); } catch {}
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state, storeKey, busy, fresh]);

  // 답한 버튼이 다음 단계에서 사라지면 초점이 문서 처음으로 돌아가 키보드 사용자가 다시 찾아와야 함
  useEffect(() => {
    // 첫 화면에서는 초점을 옮기지 않음(학생이 한 번이라도 답한 뒤부터)
    if (busy || state.log.at(-1)?.from === "me" || !state.log.some((m) => m.from === "me")) return;
    // 같은 키 입력이 새로 초점을 받은 버튼까지 누르지 않도록 키 처리가 끝난 뒤 옮김
    const timer = setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const field = typedRef.current ? controlsRef.current?.querySelector<HTMLElement>("textarea:not([disabled])") : null;
      (field ?? controlsRef.current?.querySelector<HTMLElement>("button:not([disabled])"))?.focus({ preventScroll: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [step, busy, state.log]);

  // 진행 중 한동안 말이 없으면 AI가 먼저 진행 상황을 물음
  useEffect(() => {
    if (mode !== "running" || step.kind !== "free" || state.nudges >= 5) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible")
        setState((s) => ({ ...s, nudges: s.nudges + 1, log: [...s.log, { from: "npc", text: "어디까지 했어요? 막힌 곳이 있으면 편하게 말해 주세요." }] }));
    }, CHECK_IN_MS);
    return () => clearTimeout(timer);
  }, [mode, step.kind, state.log.length, state.nudges]);

  // remember 가 참이면 답하기 전 상태를 남겨 「이전 답 고치기」로 되돌림
  const say = (me: string | null, npc: string[], patch: Partial<State> = {}, remember = false) =>
    setState((s) => ({
      ...s, ...patch,
      undo: remember ? [...s.undo, { ...s, undo: [] }].slice(-20) : s.undo,
      log: [...s.log, ...(me ? [{ from: "me" as const, text: me }] : []), ...npc.map((t) => ({ from: "npc" as const, text: t }))],
    }));
  const undo = () => setState((s) => {
    const prev = s.undo.at(-1);
    return prev ? { ...prev, undo: s.undo.slice(0, -1) } : s;
  });

  // 저장 요청은 한 번에 하나만(연속 클릭 시 두 번째 요청이 「기록이 바뀌었어요」로 보이는 문제 방지)
  function submit(fields: Record<string, string>) {
    if (sending.current) return;
    sending.current = true;
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    start(async () => {
      try { await saveScenario(projectId, form); }
      catch (e) {
        if (!(e instanceof Error && e.message.includes("NEXT_REDIRECT"))) setNotice("저장하지 못했어요. 다시 눌러 주세요."); else throw e;
      } finally {
        sending.current = false;
      }
    });
  }

  function saveReading(rating: number, note: string, notes: string[] = [], s = state) {
    submit({
      op: "read", phase: String(phase), rating: String(rating), note, notes: JSON.stringify(notes), transcript: JSON.stringify(s.log.slice(-300)),
      images: JSON.stringify(s.images),
      ...(checklist ? { checks: JSON.stringify(s.checks) } : s.value === "" ? { unknown: "yes", value: "" } : { value: s.value }),
    });
  }

  function askAi(message: string, onReply: (reply: string, draft?: string) => void) {
    // 실패하면 보낸 말을 입력칸으로 되돌려 다시 보낼 때 같은 말이 두 번 쌓이지 않게 함
    const fail = (why: string) => {
      setState((s) => ({ ...s, log: s.log.at(-1)?.from === "me" ? s.log.slice(0, -1) : s.log }));
      setText(message);
      setNotice(why);
    };
    const turns: Turn[] = [...log.map((m): Turn => ({ role: m.from === "me" ? "user" : "assistant", content: m.text })), { role: "user", content: message }];
    start(async () => {
      try {
        const res = await askScenarioCoach(projectId, turns.slice(-12));
        if (!res.text) return fail(res.error ?? "다시 시도해 주세요.");
        onReply(res.text, res.message ?? undefined);
      } catch { fail("연결이 끊겼어요. 다시 보내 주세요."); }
    });
  }

  function askItem(kind: "predict" | "check", i: number) {
    return `${i + 1}/${items.length} ‘${items[i]}’\n${kind === "predict" ? "여기까지 혼자 해낼 수 있을 것 같아요?" : "실제로 이렇게 됐어요?"}`;
  }

  function answerItem(kind: "predict" | "check", i: number, answer: CheckAnswer, label: string) {
    const checks = [...state.checks.slice(0, i), answer];
    if (i + 1 < items.length) return say(label, [askItem(kind, i + 1)], { checks, step: { kind, i: i + 1 } }, true);
    say(label, [kind === "predict" ? "전체적으로 이 과제, 얼마나 쉬울 것 같아요?" : "실제로 해 보니 얼마나 쉬웠어요?"], { checks, step: { kind: "ease" } }, true);
  }

  function answerEase(n: number) {
    if (before) {
      say(`${n}점`, ["좋아요, 기록할게요."], { rating: n });
      return saveReading(n, state.note);
    }
    say(`${n}점`, [incident
      ? `아까 막혔다고 한 곳(“${incident}”)도 좋고, 써 보면서 아쉬웠던 점이 있었어요?`
      : "써 보면서 아쉬웠거나 불편했던 점이 있었어요?"], { rating: n, step: { kind: "request" } }, true);
  }

  function send(raw: string, typed = false) {
    const msg = raw.trim();
    if (!msg || busy) return;
    typedRef.current = typed;
    setText("");
    setNotice("");
    if (step.kind === "usual") {
      const first = checklist ? [`이 과제는 아래 ${items.length}가지가 되면 완료예요.\n\n${conditions}\n\n하나씩 물어볼게요.`, askItem("predict", 0)] : [`결과는 ${unit} 단위로 적어요. 서비스를 쓰면 몇 ${unit}일 것 같아요? 모르면 비워 두고 보내 주세요.`];
      return say(msg, first, { note: msg, step: checklist ? { kind: "predict", i: 0 } : { kind: "value" } }, true);
    }
    if (step.kind === "stuck") {
      say(msg, ["기록했어요. 계속 해 보고, 또 막히면 말해 주세요."], { step: { kind: "free" } });
      return submit({ op: "incident", phase: String(phase), incident: msg.slice(0, 1000) });
    }
    if (step.kind === "request") {
      say(msg, []);
      return askAi(msg, (reply, draft) => draft
        ? say(null, [`개발사에 이렇게 전할게요.\n\n${draft}`], { step: { kind: "confirm", draft } })
        : say(null, [reply]));
    }
    say(msg, []);
    askAi(msg, (reply) => say(null, [reply]));
  }

  function tapProgress(label: string) {
    if (label === "다 했어요") return say(label, [checklist ? `수고했어요! 완료 조건 ${items.length}가지를 하나씩 확인할게요.` : `수고했어요! 결과는 몇 ${unit}였어요?`, ...(checklist ? [askItem("check", 0)] : [])], { step: checklist ? { kind: "check", i: 0 } : { kind: "value" } }, true);
    if (label === "막혔어요" && !incident) return say(label, ["어디서 막혔어요? 편하게 말해 주세요."], { step: { kind: "stuck" } });
    if (label === "막혔어요") return send("또 막혔어요");
    say(label, ["좋아요. 다 하면 ‘다 했어요’, 막히면 ‘막혔어요’를 눌러 주세요."]);
  }

  const typing = ["usual", "free", "stuck", "request", "value"].includes(step.kind);
  const canUndo = state.undo.length > 0 && !busy && ["predict", "check", "ease", "value", "request", "confirm", "images"].includes(step.kind);

  const [dragging, setDragging] = useState(false);

  // 메신저 첨부와 같은 업로드 경로(이미지 검사·용량·한도 동일). 실패한 파일만 알리고 나머지는 담음
  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    setUploading(true);
    setNotice("");
    try {
      for (const raw of Array.from(files).slice(0, MAX_IMAGES - state.images.length)) {
        const file = normalizeUploadFile(raw);
        const form = new FormData();
        form.set("file", file);
        try {
          const res = await fetch("/api/messages/upload", { method: "POST", body: form });
          const data = await res.json();
          if (res.ok && data.kind === "image") setState((s) => s.images.length >= MAX_IMAGES ? s : { ...s, images: [...s.images, { url: data.url, name: data.name }] });
          else setNotice(data.error || `‘${file.name}’을 올리지 못했어요.`);
        } catch {
          setNotice(`‘${file.name}’을 올리지 못했어요.`);
        }
      }
    } finally {
      setUploading(false);
    }
  }
  const uploadRef = useRef(upload);
  useEffect(() => { uploadRef.current = upload; });
  // 캡처 단계에는 입력칸이 없어 화면 어디서든 Ctrl+V 로 이미지를 바로 붙일 수 있게 함
  useEffect(() => {
    if (step.kind !== "images") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) {
        e.preventDefault();
        void uploadRef.current(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step.kind]);
  const after = mode === "done";

  function keep(draft: string) {
    if (!after) {
      const notes = [...state.notes, draft];
      // 한 번에 보낼 수 있는 요청은 10건까지. 다 차면 캡처 질문으로 넘어감
      if (notes.length >= MAX_NOTES)
        return say("이대로 담아 주세요", ["요청을 충분히 담았어요.", ASK_IMAGES], { notes, step: { kind: "images" } }, true);
      return say("이대로 담아 주세요", ["담아 뒀어요. 또 아쉬웠던 점은 없었어요?"], { notes, step: { kind: "request" } }, true);
    }
    if (!readingId) return;
    say("이대로 보내 주세요", ["개발사에 보냈어요. 답이 오면 알림으로 알려 드릴게요."], { step: { kind: "free" } });
    submit({ op: "request", reading: readingId, note: draft, requestId: crypto.randomUUID() });
  }

  return (
    <section aria-label="과제 대화" className="flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col overflow-hidden rounded-[var(--radius-xl)] bg-white">
      <div className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--gray-100)] px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <EviAvatar size={32} />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Evi</p>
            <p className="text-xs text-[var(--muted)]">{busy ? "답을 쓰는 중…" : "과제를 함께 진행해요"}</p>
          </div>
        </div>
        {canUndo && (
          <button type="button" className={ui.textButton} onClick={undo}>
            <Icon name="undo" size={14} /> 이전 답 고치기
          </button>
        )}
      </div>
      <details className="group border-b border-[var(--gray-100)] bg-[var(--accent-light)] px-4 py-3 sm:px-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--accent)]">오늘의 과제</span>
            <span className="block truncate text-sm font-medium group-open:whitespace-normal">{task}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
            <span className="group-open:hidden">펼치기</span><span className="hidden group-open:inline">접기</span>
          </span>
        </summary>
        {checklist && (
          <ol className="mt-3 flex flex-wrap gap-2">
            {items.map((item, i) => (
              <li key={item} className={`${ui.badge} bg-white py-1 text-[var(--gray-700)]`}>
                <span className="font-bold text-[var(--accent)]">{i + 1}</span> {item}
              </li>
            ))}
          </ol>
        )}
      </details>
      <div ref={logRef} role="log" aria-live="polite" aria-label="대화 기록" tabIndex={0} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--gray-50)] px-4 py-5 sm:px-6">
        {log.map((m, i) => m.from === "me" ? (
          <p key={i} className={ui.bubbleMe}>{m.text}</p>
        ) : (
          <div key={i} className="flex items-start gap-2">
            <EviAvatar size={28} className={log[i - 1]?.from === "npc" ? "invisible" : ""} />
            <p className={ui.bubbleAiOnGray}>{m.text}</p>
          </div>
        ))}
        {busy && (
          <div className="flex items-start gap-2">
            <EviAvatar size={28} />
            <p className={`${ui.bubbleAiOnGray} inline-flex gap-1`} aria-label="답을 쓰는 중">
              {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]" style={{ animationDelay: `${d}ms` }} />)}
            </p>
          </div>
        )}
      </div>

      <div ref={controlsRef} className="space-y-3 border-t border-[var(--gray-100)] px-4 py-4 sm:px-6">
        {notice && <p role="status" className="text-sm text-[var(--danger)]">{notice}</p>}
        {step.kind === "usual" && (
          <div className="flex flex-wrap gap-2">
            {usualChoices.map((c) => <button key={c} type="button" className={ui.chip} disabled={busy} onClick={() => send(c)}>{c}</button>)}
          </div>
        )}
        {(step.kind === "predict" || step.kind === "check") && (
          <div className="flex flex-wrap gap-2">
            {choice[step.kind].map(([v, label]) => <button key={v} type="button" className={`${ui.chipBase} ${tone[v]}`} disabled={busy} onClick={() => answerItem(step.kind as "predict" | "check", step.i, v, label)}>{v === "yes" && <Icon name="check" size={14} className="mr-1" />}{label}</button>)}
          </div>
        )}
        {step.kind === "ease" && (
          <div>
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} type="button" className={`${ui.chipBase} min-h-12 justify-center rounded-[var(--radius-md)] bg-[var(--accent-light)] px-0 text-base font-bold text-[var(--accent)] ring-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white`} disabled={busy} onClick={() => answerEase(n)}>{n}</button>)}
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-[var(--muted)]"><span>매우 어려움</span><span>매우 쉬움</span></div>
          </div>
        )}
        {step.kind === "start" && (
          <button type="button" className={ui.primary} disabled={busy} onClick={() => {
            if (link && window.innerWidth < 1024) window.open(link, "_blank", "noopener");
            submit({ op: "start", phase: String(phase) });
          }}><Icon name="play" size={14} className="mr-2" />과제 시작</button>
        )}
        {mode === "running" && step.kind === "free" && (
          <div className="flex flex-wrap gap-2">
            {progress.map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => tapProgress(c)}
                className={c === "다 했어요" ? `${ui.chipBase} bg-[var(--accent)] font-semibold text-white ring-[var(--accent)] hover:bg-[var(--accent-dark)]` : c === "막혔어요" ? `${ui.chipBase} bg-[var(--warning-light)] text-[var(--warning)] ring-[var(--warning-light)] hover:ring-[var(--warning)]` : ui.chip}>
                {c === "다 했어요" && <Icon name="check" size={14} className="mr-1.5" />}{c}
              </button>
            ))}
            {link && <a className={ui.chip} href={link} target="_blank" rel="noreferrer"><Icon name="external" size={14} className="mr-1.5" />서비스 새 탭으로</a>}
          </div>
        )}
        {after && step.kind === "free" && readingId && (
          <button type="button" className={ui.chip} disabled={busy} onClick={() => say("아쉬운 점을 더 남길게요", ["좋아요. 어떤 점이 아쉬웠어요?"], { step: { kind: "request" } })}>아쉬운 점 더 남기기</button>
        )}
        {step.kind === "request" && (
          <button type="button" className={ui.chip} disabled={busy} onClick={() => {
            if (after) return say("없어요", ["알겠어요."], { step: { kind: "free" } });
            say(state.notes.length ? "더 없어요" : "없었어요", [ASK_IMAGES], { step: { kind: "images" } }, true);
          }}>{after || state.notes.length ? "더 없어요" : "없었어요"}</button>
        )}
        {step.kind === "images" && (
          <div
            className={`space-y-3 rounded-[var(--radius-md)] transition-colors ${dragging ? "bg-[var(--accent-light)]/50 p-2 ring-2 ring-[var(--accent)]" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
          >
            <p className="text-xs text-[var(--muted)]">
              이미지를 끌어다 놓거나 Ctrl+V로 바로 붙여넣을 수 있어요.
            </p>
            {state.images.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {state.images.map((img, i) => (
                  <li key={img.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} className="h-16 w-16 rounded-[var(--radius-md)] object-cover" />
                    <button type="button" aria-label={`${img.name} 빼기`} disabled={busy}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gray-700)] text-white"
                      onClick={() => setState((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))}>
                      <Icon name="close" size={10} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden"
              onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              {state.images.length < MAX_IMAGES && (
                <button type="button" className={ui.chip} disabled={busy || uploading} onClick={() => fileRef.current?.click()}>
                  <Icon name="attach" size={14} className="mr-1.5" />{uploading ? "올리는 중…" : state.images.length ? "더 올리기" : "캡처 올리기"}
                </button>
              )}
              <button type="button" disabled={busy || uploading}
                className={state.images.length ? ui.primary : ui.chip}
                onClick={() => {
                  say(state.images.length ? `캡처 ${state.images.length}장을 올렸어요` : "없어요", ["알려 줘서 고마워요. 기록을 저장할게요."]);
                  saveReading(state.rating, "", state.notes);
                }}>
                {state.images.length ? "이대로 마치기" : "없어요, 마칠게요"}
              </button>
            </div>
          </div>
        )}
        {step.kind === "confirm" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.primary} disabled={busy} onClick={() => keep(step.draft)}>{after ? "이대로 보내기" : "이대로 담기"}</button>
            <button type="button" className={ui.secondary} disabled={busy} onClick={() => say("다시 쓸게요", ["좋아요. 전하고 싶은 내용을 다시 말해 주세요."], { step: { kind: "request" } })}>다시 쓸게요</button>
          </div>
        )}
        {typing && (
          <form className="flex items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (step.kind === "value") {
              const v = text.trim();
              if (v !== "" && !/^-?\d+(\.\d+)?$/.test(v)) return setNotice("숫자로 적어 주세요.");
              setText("");
              const patch = { value: v };
              if (before) return say(v || "모르겠어요", ["전체적으로 이 과제, 얼마나 쉬울 것 같아요?"], { ...patch, step: { kind: "ease" } }, true);
              return say(v || "확인 못 했어요", ["실제로 해 보니 얼마나 쉬웠어요?"], { ...patch, step: { kind: "ease" } }, true);
            }
            send(text, true);
          }}>
            <label className="sr-only" htmlFor={`quest-${projectId}`}>메시지</label>
            <textarea id={`quest-${projectId}`} rows={1} maxLength={1500} value={text} disabled={busy}
              className={`${ui.field} min-h-11 resize-none`}
              placeholder={step.kind === "value" ? `숫자(${unit})` : "편하게 말해 주세요"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            <button className={ui.primary} disabled={busy || (step.kind !== "value" && !text.trim())} aria-label="보내기"><Icon name="send" size={16} /></button>
          </form>
        )}
        <p className="text-xs text-[var(--muted)]">AI가 묻고 기록해요. 이름이나 연락처는 적지 말아 주세요.</p>
      </div>
    </section>
  );
}
