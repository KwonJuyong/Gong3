"use client";

import { useActionState } from "react";
import { resendVerificationAction } from "../actions";
import type { ActionState } from "../db";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

/**
 * 인증 메일 재발송 폼(/verify 와 로그인 화면에서 씀).
 * 가입 여부가 드러나지 않도록 성공 문구는 계정 상태와 관계없이 같음
 */
export default function ResendForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resendVerificationAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        name="identifier"
        placeholder="example@hallym.ac.kr"
        required
        autoComplete="username"
        className={inputCls}
      />
      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
          인증이 필요한 계정이라면 가입 이메일로 인증 메일을 다시 보냈습니다. 메일함(스팸함
          포함)을 확인해 주세요.
        </p>
      )}
      <button
        disabled={pending}
        className="w-full py-2.5 border border-[var(--gray-300)] text-[var(--gray-700)] rounded-[var(--radius-md)] font-medium text-sm hover:bg-[var(--gray-50)] disabled:opacity-50 transition-colors"
      >
        {pending ? "보내는 중…" : "인증 메일 다시 받기"}
      </button>
    </form>
  );
}
