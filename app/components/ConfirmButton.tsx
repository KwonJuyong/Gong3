"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { confirmDialog } from "./feedback";
import { Pending } from "./SubmitButton";

/**
 * 누르기 전에 확인을 받는 submit 버튼. 되돌릴 수 없는 조작에 씀
 * 서버 컴포넌트 페이지의 <form action={serverAction}> 안에 그대로 넣을 수 있음
 *
 * message 안의 {필드이름} 은 누르는 순간 같은 폼의 값으로 바뀜(<select> 는 옵션 라벨).
 * 예: "역할을 {role} 로 바꿉니다"
 *
 * 확인 대화상자가 비동기라 제출을 먼저 막고, 확인되면 이 버튼을 제출자로 다시 제출함
 * requestSubmit 은 click 을 다시 일으키지 않으므로 두 번 묻지 않음
 * 실수 방지용이며 권한 검사는 서버 액션에서 함
 */
export default function ConfirmButton({
  message,
  onClick,
  type = "submit",
  danger,
  confirmLabel,
  pendingText = "처리 중…",
  disabled,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  message: string;
  /** 되돌릴 수 없는 파괴적 조작(삭제·제외)이면 확인 버튼을 빨갛게 */
  danger?: boolean;
  confirmLabel?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const btn = e.currentTarget;
    const form = btn.form;
    const text = fillFromForm(message, form);
    // 확인창보다 브라우저 기본 검증을 먼저 함
    if (form && !form.reportValidity()) return;
    void confirmDialog({ message: text, danger, confirmLabel }).then((ok) => {
      if (!ok) return;
      onClick?.(e);
      if (type === "submit" && form) form.requestSubmit(btn);
    });
  }

  return (
    <button
      type={type}
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={handleClick}
      className={`${className} disabled:opacity-60 ${pending ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      {pending ? <Pending text={pendingText} /> : children}
    </button>
  );
}

function fillFromForm(message: string, form: HTMLFormElement | null): string {
  if (!form) return message;
  return message.replace(/\{([\w-]+)\}/g, (whole, name: string) => {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLSelectElement) {
      return el.selectedOptions[0]?.text.trim() || el.value || "(선택 없음)";
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value.trim() || "(비어 있음)";
    }
    return whole;
  });
}
