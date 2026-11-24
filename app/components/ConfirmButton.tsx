"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { confirmDialog } from "./feedback";
import { Pending } from "./SubmitButton";

// message의 {field}는 제출 시점 폼 값으로 치환. 확인 후 requestSubmit으로 재제출
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
