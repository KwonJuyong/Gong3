"use client";

import { useState, type InputHTMLAttributes } from "react";

/** 확인 칸 대신 입력값을 볼 수 있게 해 오타를 줄임(폰에서 가린 입력은 틀리기 쉬움) */
export default function PasswordInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${className} pr-16`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-[var(--gray-600)] hover:text-[var(--accent)]"
      >
        {shown ? "숨기기" : "보기"}
      </button>
    </div>
  );
}
