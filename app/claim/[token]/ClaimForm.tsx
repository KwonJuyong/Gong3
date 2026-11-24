"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { useFormSubmit } from "@/app/components/useFormSubmit";
import { BTN_PRIMARY, INPUT, LABEL } from "@/app/AuthParts";
import { claimAccountAction } from "../actions";

export default function ClaimForm({ token }: { token: string }) {
  const [state, form, pending] = useFormSubmit(claimAccountAction);

  return (
    <form {...form} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="claim-email" className={LABEL}>
          이메일 <span className="text-[var(--danger)]">*</span>
        </label>
        <p className="text-xs text-[var(--gray-500)] mb-1.5">
          앞으로 이 주소로 로그인합니다. 학교 메일도 개인 메일도 됩니다.
        </p>
        <input
          id="claim-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="example@hallym.ac.kr"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="claim-email-confirm" className={LABEL}>
          이메일 확인 <span className="text-[var(--danger)]">*</span>
        </label>
        <input
          id="claim-email-confirm"
          name="emailConfirm"
          type="email"
          required
          autoComplete="email"
          placeholder="한 번 더 입력해 주세요"
          className={INPUT}
        />
      </div>

      <div className="pt-1">
        <label htmlFor="claim-pw" className={LABEL}>
          새 비밀번호 <span className="text-[var(--danger)]">*</span>
        </label>
        <p className="text-xs text-[var(--gray-500)] mb-1.5">
          8자 이상. 학번과 같은 값은 쓸 수 없습니다.
        </p>
        <input
          id="claim-pw"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="새 비밀번호"
          className={INPUT}
        />
      </div>

      <div>
        <label htmlFor="claim-pw-confirm" className={LABEL}>
          비밀번호 확인 <span className="text-[var(--danger)]">*</span>
        </label>
        <input
          id="claim-pw-confirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
        등록하고 시작하기
      </SubmitButton>
    </form>
  );
}
