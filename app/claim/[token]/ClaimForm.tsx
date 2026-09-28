"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { useActionState } from "react";
import { claimAccountAction } from "../actions";
import { ActionState } from "../../db";

/**
 * 계정 인계 폼. 인증 메일을 보내지 않으므로 오타를 막으려고 이메일을 두 번 받는다.
 * 서버 액션은 URL 을 볼 수 없어 token 을 hidden 으로 보낸다.
 */
export default function ClaimForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(claimAccountAction, null);

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
  const labelCls = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="claim-email" className={labelCls}>
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
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="claim-email-confirm" className={labelCls}>
          이메일 확인 <span className="text-[var(--danger)]">*</span>
        </label>
        <input
          id="claim-email-confirm"
          name="emailConfirm"
          type="email"
          required
          autoComplete="email"
          placeholder="한 번 더 입력해 주세요"
          className={inputCls}
        />
      </div>

      <div className="pt-1">
        <label htmlFor="claim-pw" className={labelCls}>
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
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="claim-pw-confirm" className={labelCls}>
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
          className={inputCls}
        />
      </div>

      {state?.error && (
        <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
          {state.error}
        </p>
      )}

      <SubmitButton className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] transition-all mt-2">
        등록하고 시작하기
      </SubmitButton>
    </form>
  );
}
