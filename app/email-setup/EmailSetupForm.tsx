"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { useActionState } from "react";
import { setMissingEmailAction } from "../actions";
import { ActionState } from "../db";

/**
 * 이메일 등록 폼. 인증 메일을 보내지 않으므로 오타를 막으려고 주소를 두 번 받음
 * 붙여넣기는 막지 않음
 */
export default function EmailSetupForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setMissingEmailAction,
    null,
  );

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium text-[var(--gray-700)] mb-1"
        >
          이메일 <span className="text-[var(--danger)]">*</span>
        </label>
        <p className="text-xs text-[var(--gray-500)] mb-1.5">
          학교 메일(@hallym.ac.kr)을 권장하지만 개인 메일도 됩니다.
        </p>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="example@hallym.ac.kr"
          className={inputCls}
        />
      </div>

      <div>
        <label
          htmlFor="emailConfirm"
          className="block text-xs font-medium text-[var(--gray-700)] mb-1.5"
        >
          이메일 확인 <span className="text-[var(--danger)]">*</span>
        </label>
        <input
          id="emailConfirm"
          name="emailConfirm"
          type="email"
          required
          autoComplete="email"
          placeholder="한 번 더 입력해 주세요"
          className={inputCls}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
          {state.error}
        </p>
      )}

      <SubmitButton className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] transition-all mt-2">
        등록하고 계속하기
      </SubmitButton>
    </form>
  );
}
