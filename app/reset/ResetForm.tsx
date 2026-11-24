"use client";

import { useActionState } from "react";
import PasswordInput from "../components/PasswordInput";
import Link from "next/link";
import { completePasswordResetAction } from "../actions";
import type { ActionState } from "../db";
import { BTN_PRIMARY, INPUT } from "../AuthParts";

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completePasswordResetAction,
    null,
  );

  if (state?.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.
        </p>
        <Link href="/" className={BTN_PRIMARY}>
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
        <PasswordInput
          id="newPassword"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="8자 이상"
          className={INPUT}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)]">
          {state.error}
        </p>
      )}

      <button disabled={pending} className={`${BTN_PRIMARY} mt-2`}>
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
