"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * 제출 중에는 비활성화하고 「처리 중…」을 보여주는 submit 버튼.
 * 서버 컴포넌트 페이지의 <form action> 안에 그대로 넣을 수 있다.
 */
export default function SubmitButton({
  children,
  pendingText = "처리 중…",
  disabled,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${className} disabled:opacity-60 ${pending ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
    >
      {pending ? <Pending text={pendingText} /> : children}
    </button>
  );
}

export function Pending({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {text}
    </span>
  );
}
