"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

/**
 * 앱 공용 토스트와 확인 대화상자(alert·confirm 대신 쓴다).
 *
 * 사용: toast("저장했습니다", "success"), await confirmDialog("…"),
 * 폼이면 onSubmit={(e) => confirmSubmit(e, "…")}. 호스트(<FeedbackHost/>)는 루트 레이아웃에 하나 있다.
 * 호스트가 없으면 네이티브 confirm/alert 를 쓴다. 확인창은 실수 방지용이며 권한 검사는 서버에서 한다.
 */

export type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };

export type ConfirmOptions = {
  message: string;
  /** 확인 버튼 글자. 기본 「확인」, 가능하면 동사로(「삭제」「발행」). */
  confirmLabel?: string;
  /** 되돌릴 수 없는 파괴적 조작이면 확인 버튼을 빨갛게 */
  danger?: boolean;
};
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

let hostMounted = false;

export function toast(message: string, tone: ToastTone = "info") {
  if (typeof window === "undefined") return;
  if (!hostMounted) {
    window.alert(message);
    return;
  }
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, tone } }));
}

export function confirmDialog(opts: string | ConfirmOptions): Promise<boolean> {
  const o = typeof opts === "string" ? { message: opts } : opts;
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!hostMounted) return Promise.resolve(window.confirm(o.message));
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("app:confirm", { detail: { ...o, resolve } }));
  });
}

/**
 * <form onSubmit={(e) => confirmSubmit(e, "…")}>: 확인을 받은 뒤에만 제출한다.
 * 제출을 먼저 막고, 확인되면 같은 제출 버튼으로 다시 제출한다(버튼마다 formAction 이 다를 수 있다).
 */
export function confirmSubmit(e: FormEvent<HTMLFormElement>, opts: string | ConfirmOptions) {
  const form = e.currentTarget;
  if (form.dataset.confirmed === "1") {
    delete form.dataset.confirmed;
    return;
  }
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  void confirmDialog(opts).then((ok) => {
    if (!ok) return;
    form.dataset.confirmed = "1";
    form.requestSubmit(submitter ?? undefined);
  });
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    hostMounted = true;
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail as { message: string; tone: ToastTone };
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      // 오류는 읽고 대처할 시간이 더 필요하다
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    };
    const onConfirm = (e: Event) => setReq((e as CustomEvent).detail as ConfirmRequest);
    window.addEventListener("app:toast", onToast);
    window.addEventListener("app:confirm", onConfirm);
    return () => {
      hostMounted = false;
      window.removeEventListener("app:toast", onToast);
      window.removeEventListener("app:confirm", onConfirm);
    };
  }, [dismiss]);

  // <dialog>.showModal() 이 포커스 가두기·Esc·배경 비활성을 브라우저 기본으로 해 준다.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (req && !d.open) {
      d.showModal();
      // 기본 포커스는 「취소」(Enter 연타로 확인되지 않게)
      cancelRef.current?.focus();
    }
    if (!req && d.open) d.close();
  }, [req]);

  const answer = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  const toneCls: Record<ToastTone, string> = {
    info: "bg-[var(--gray-900)] text-white",
    success: "bg-[var(--success)] text-white",
    error: "bg-[var(--danger)] text-white",
  };

  return (
    <>
      <div
        aria-live="polite"
        className="fixed top-16 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 w-[min(92vw,440px)] pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto w-full flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] text-sm leading-relaxed ${toneCls[t.tone]}`}
          >
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="닫기"
              className="shrink-0 -mr-1 w-6 h-6 rounded flex items-center justify-center opacity-80 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-label="확인"
        onCancel={(e) => {
          e.preventDefault();
          answer(false);
        }}
        className="m-auto w-[min(92vw,440px)] rounded-[var(--radius-xl)] p-0 shadow-[var(--shadow-lg)] backdrop:bg-black/40"
      >
        {req && (
          <div className="p-6">
            <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-line">{req.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => answer(false)}
                className="px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--gray-50)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => answer(true)}
                className={`px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold text-white ${
                  req.danger ? "bg-[var(--danger)] hover:opacity-90" : "bg-[var(--accent)] hover:bg-[var(--accent-dark)]"
                }`}
              >
                {req.confirmLabel || "확인"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
