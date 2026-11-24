"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "./components/feedback";
import SubmitButton from "./components/SubmitButton";
import PhoneInput from "./components/PhoneInput";
import PasswordInput from "./components/PasswordInput";
import { useFormSubmit } from "./components/useFormSubmit";
import { registerAction } from "./actions";
import { Alert, Group, INPUT, LABEL, Req } from "./AuthParts";

export type RegType = "STUDENT" | "DEVELOPER" | "STAFF";

/**
 * 유형별 입력 칸을 한 폼에 둠
 * 단계를 더 나누면 중간 상태 보관과 단계별 중복 검사(계정 열거)가 필요해짐
 */
export default function RegisterForm({
  regType,
  onRegistered,
}: {
  regType: RegType;
  onRegistered: (email: string) => void;
}) {
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [state, form, pending] = useFormSubmit(registerAction);
  const emailRef = useRef<HTMLInputElement>(null);

  // 두 번째 성공(true → true)에서도 돌도록 상태 객체에 반응함
  useEffect(() => {
    if (state?.success) onRegistered(emailRef.current?.value.trim() ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isDev = regType === "DEVELOPER";

  return (
    <form
      action={form.action}
      onSubmit={(e) => {
        if (!privacyAgreed) {
          e.preventDefault();
          toast("개인정보 수집 및 이용에 동의해 주세요.", "error");
          return;
        }
        form.onSubmit(e);
      }}
      className="space-y-6"
    >
      <input type="hidden" name="userType" value={regType} />

      <Group title="기본 정보">
        <div>
          <label htmlFor="reg-name" className={LABEL}>
            이름 <Req />
          </label>
          <input id="reg-name" name="name" placeholder="홍길동" required autoComplete="name" className={INPUT} />
          <p className="text-xs text-[var(--gray-500)] mt-1">
            {isDev ? "담당자 실명을 입력해 주세요." : "보상 지급에 쓰이므로 실명을 입력해 주세요."}
          </p>
        </div>
        <div>
          <label className={LABEL}>
            전화번호 <Req />
          </label>
          <PhoneInput name="phone" required />
        </div>
      </Group>

      <Group title={isDev ? "소속 기업" : "소속 정보"}>
        {regType === "STUDENT" && (
          <>
            <div>
              <label htmlFor="reg-studentId" className={LABEL}>
                학번 <Req />
              </label>
              <input id="reg-studentId" name="studentId" placeholder="20240001" required inputMode="numeric" className={INPUT} />
            </div>
            <div>
              <label htmlFor="reg-major" className={LABEL}>
                전공 <Req />
              </label>
              <input id="reg-major" name="major" required placeholder="전공명을 입력하세요" className={INPUT} />
            </div>
          </>
        )}

        {regType === "STAFF" && (
          <>
            <div>
              <label htmlFor="reg-employeeId" className={LABEL}>
                사번 <Req />
              </label>
              <input
                id="reg-employeeId"
                name="employeeId"
                placeholder="AB1234"
                required
                maxLength={8}
                pattern="[a-zA-Z0-9]+"
                title="영문과 숫자만 입력 가능합니다"
                className={INPUT}
              />
              <p className="text-xs text-[var(--gray-500)] mt-1">영문·숫자만, 최대 8자리</p>
            </div>
            <div>
              <label htmlFor="reg-affiliation" className={LABEL}>
                소속 <Req />
              </label>
              <input id="reg-affiliation" name="major" required placeholder="소속 학과 또는 부서명을 입력하세요" className={INPUT} />
            </div>
          </>
        )}

        {isDev && (
          <div>
            <label htmlFor="reg-companyName" className={LABEL}>
              기업명 <Req />
            </label>
            <input
              id="reg-companyName"
              name="companyName"
              placeholder="(주)회사명"
              required
              autoComplete="organization"
              className={INPUT}
            />
            <p className="text-xs text-[var(--gray-500)] mt-1">
              사업자등록번호는 나중에 프로필에서 등록합니다. 의뢰·견적서에 필요합니다.
            </p>
          </div>
        )}
      </Group>

      <Group title="로그인 정보">
        {/* 기업은 devEmail 로 받고 registerAction 이 email 에도 넣음 */}
        <div>
          <label htmlFor="reg-email" className={LABEL}>
            이메일 (로그인 ID) <Req />
          </label>
          <input
            ref={emailRef}
            id="reg-email"
            name={isDev ? "devEmail" : "email"}
            type="email"
            required
            autoComplete="email"
            placeholder={isDev ? "you@company.com" : "example@hallym.ac.kr"}
            className={INPUT}
          />
          <p className="text-xs text-[var(--gray-500)] mt-1 leading-relaxed">
            가입 후 이 주소로 인증 메일이 가요. 링크를 눌러야 로그인할 수 있으니 받을 수 있는 주소를 넣어 주세요.
          </p>
        </div>
        <div>
          <label htmlFor="reg-password" className={LABEL}>
            비밀번호 <Req />
          </label>
          <PasswordInput
            id="reg-password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="8자 이상"
            className={INPUT}
          />
          <p className="text-xs text-[var(--gray-500)] mt-1">흔한 비밀번호나 학번·이메일과 같은 값은 쓸 수 없어요.</p>
        </div>
      </Group>

      <div className="border-t border-[var(--gray-200)] pt-5 space-y-3">
        <div className="text-xs text-[var(--gray-500)] leading-relaxed space-y-1">
          <p>
            <strong className="text-[var(--gray-700)]">수집 항목</strong> · 이름, 전화번호, 이메일
            {regType === "STUDENT" && ", 학번, 전공"}
            {regType === "STAFF" && ", 사번, 소속"}
            {isDev && ", 기업명"}
          </p>
          <p>
            <strong className="text-[var(--gray-700)]">수집 목적</strong> · 서비스 이용, 본인 확인, 비밀번호 찾기
            {!isDev && ", 보상 지급"}
          </p>
          <p>
            <strong className="text-[var(--gray-700)]">보유 기간</strong> · 회원 탈퇴 시까지
          </p>
          {/* 접속기록은 법령에 따른 수집이라 동의 대상이 아님. 보관기간은 accessLog.ts 와 맞춤 */}
          <p>
            <strong className="text-[var(--gray-700)]">자동 수집(안내)</strong> · 로그인·개인정보 처리 시 접속
            IP·일시·브라우저 정보를 접속기록으로 남기며, 관련 법령에 따라 2년간 보관합니다.
          </p>
          <p>동의하지 않으실 수 있으며, 그 경우 서비스 이용이 제한됩니다.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer py-1">
          <input
            type="checkbox"
            name="privacyConsent"
            value="1"
            checked={privacyAgreed}
            onChange={(e) => setPrivacyAgreed(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--accent)]"
          />
          <span className="text-xs font-medium text-[var(--gray-700)]">
            개인정보 수집 및 이용에 동의합니다. <Req />
          </span>
        </label>
      </div>

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <SubmitButton
        pending={pending}
        pendingText="가입 처리 중…"
        className={`w-full py-2.5 rounded-[var(--radius-md)] font-semibold text-sm transition-all ${
          privacyAgreed
            ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] active:scale-[0.98]"
            : "bg-[var(--gray-200)] text-[var(--gray-700)] cursor-not-allowed"
        }`}
      >
        회원가입
      </SubmitButton>
    </form>
  );
}
