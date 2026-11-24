"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { useFormSubmit } from "../components/useFormSubmit";
import { BTN_PRIMARY, INPUT } from "../AuthParts";
import { setMissingEmailAction } from "../actions";

export default function EmailSetupForm() {
  const [state, form, pending] = useFormSubmit(setMissingEmailAction);

  return (
    <form {...form} className="space-y-3">
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
          className={INPUT}
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
          className={INPUT}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
          {state.error}
        </p>
      )}

      <SubmitButton pending={pending} className={`${BTN_PRIMARY} mt-2`}>
        등록하고 계속하기
      </SubmitButton>
    </form>
  );
}
