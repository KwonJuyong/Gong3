"use client";

import { useActionState } from "react";
import Link from "next/link";
import { completePasswordResetAction } from "../actions";
import type { ActionState } from "../db";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completePasswordResetAction,
    null,
  );

  // 성공하면 로그인 링크만 보여줌. 새 비밀번호로 직접 로그인해 보게 하려고 자동 로그인은 하지 않음
  if (state?.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.
        </p>
        <Link
          href="/"
          className="block w-full text-center py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
        >
          로그인하기
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="newPassword" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5">
          새 비밀번호
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8자 이상"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5">
          새 비밀번호 확인
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="한 번 더 입력"
          className={inputCls}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)]">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] disabled:opacity-50 transition-all mt-2"
      >
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
