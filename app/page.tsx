"use client";

import { useCallback, useEffect, useState, useActionState } from "react";
import { toast } from "./components/feedback";
import SubmitButton from "./components/SubmitButton";
import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  migrateToEmailLoginAction,
} from "./actions";
import { ActionState } from "./db";
import PhoneInput from "./components/PhoneInput";
import MajorSelect from "./components/MajorSelect";
import ResendForm from "./verify/ResendForm";
import DemoAccountsPanel from "./components/DemoAccountsPanel";
import { EMAIL_UNVERIFIED_ERROR, LEGACY_ID_ERROR } from "./lib/authMessages";

/**
 * 로그인 · 회원가입 · 계정 복구 화면.
 *
 * start ─┬─ 로그인
 *        │    └─ 로그인이 안 되시나요? → help ─┬─ 비밀번호 재설정       → reset
 *        │                                     ├─ 인증 메일 재발송      → resend
 *        │                                     └─ 이메일 등록(학번만)   → migrate
 *        └─ 회원가입 ── 1 유형 선택 ── 2 정보 입력 ── 3 인증 메일 안내
 *
 * 복구 경로는 로그인에 실패하지 않아도 help 화면에서 항상 고를 수 있게 둔다.
 */

type Mode =
  | "start"
  | "login"
  | "help"
  | "reset"
  | "resend"
  | "migrate"
  | "migrated"
  | "register"
  | "registered";

type RegType = "STUDENT" | "DEVELOPER" | "STAFF";

/**
 * 가입 유형. 유형에 따라 입력 칸이 달라지므로 이 선택만 별도 단계로 둔다.
 * 나머지 칸은 한 폼에 둔다. 단계를 더 나누면 중간 상태 보관과 단계별 중복 검사(계정 열거)가 필요해진다.
 */
const REG_TYPES: { key: RegType; label: string; desc: string; icon: string }[] = [
  {
    key: "STUDENT",
    label: "평가단원",
    desc: "AI 서비스를 평가하고 보상을 받는 한림대 학생",
    icon: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
  },
  {
    key: "DEVELOPER",
    label: "기업 · 외부 참여자",
    desc: "평가를 발주하거나 자사 서비스를 등록하려는 분",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01",
  },
  {
    key: "STAFF",
    label: "교직원 · 조교",
    desc: "연구·수업 목적으로 평가를 개설하는 교내 구성원",
    icon: "M20 7h-9M14 17H5M17 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  },
];

const INPUT =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
const LABEL = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";
const BTN_PRIMARY =
  "w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] transition-all";

const Req = () => <span className="text-[var(--danger)]">*</span>;

/**
 * 시작·유형·도움말 화면의 선택 카드.
 * 렌더 함수 안에서 정의하면 매번 리마운트되므로 모듈 레벨에 둔다.
 */
function ChoiceCard({
  label,
  desc,
  icon,
  onClick,
  primary = false,
}: {
  label: string;
  desc: string;
  icon: string;
  onClick: () => void;
  primary?: boolean;
}) {
  // 회색 면 한 줄. 권하는 선택(primary)은 아이콘 칸만 강조색으로 칠한다.
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left p-3 sm:p-3.5 rounded-[var(--radius-lg)] bg-[var(--gray-100)] hover:bg-[var(--gray-200)] transition-colors"
    >
      <span
        className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] ${
          primary ? "bg-[var(--accent)] text-white" : "bg-white text-[var(--gray-700)]"
        }`}
        aria-hidden
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--gray-900)]">{label}</span>
        <span className="block text-[13px] text-[var(--muted)] leading-relaxed mt-0.5">{desc}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--gray-500)]" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

/** 회원가입 단계 표시 */
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["유형 선택", "정보 입력", "이메일 인증"];
  return (
    <ol className="flex items-center gap-1.5 mb-5" aria-label="회원가입 단계">
      {labels.map((l, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const now = n === current;
        return (
          <li key={l} className="flex items-center gap-1.5 min-w-0">
            <span
              className={`shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                now
                  ? "bg-[var(--accent)] text-white"
                  : done
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "bg-[var(--gray-100)] text-[var(--gray-500)]"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span
              className={`text-xs truncate ${
                now ? "font-semibold text-[var(--gray-900)]" : "text-[var(--gray-500)]"
              }`}
            >
              {l}
            </span>
            {i < labels.length - 1 && (
              <span className="w-3 h-px bg-[var(--gray-200)] shrink-0 ml-0.5" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 폼 안의 입력 묶음 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold text-[var(--gray-500)] mb-2">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "text-[var(--danger)] bg-[var(--danger-light)]"
      : tone === "success"
        ? "text-[var(--success)] bg-[var(--success-light)]"
        : "text-[var(--gray-700)] bg-[var(--gray-100)]";
  return (
    <div className={`text-sm px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

/** ?mode= 로 바로 열 수 있는 화면. 성공 화면은 제외한다. */
const URL_MODES: Mode[] = ["login", "help", "reset", "resend", "migrate", "register"];

export default function Page() {
  const [mode, setModeState] = useState<Mode>("start");
  // 화면 단계를 ?mode= 에 실어 뒤로가기·새로고침이 동작하게 한다.
  // 성공 화면은 replace 로 바꿔 뒤로가기로 제출한 폼에 돌아가지 않게 한다.
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    const url = new URL(window.location.href);
    if (m === "start") url.searchParams.delete("mode");
    else url.searchParams.set("mode", m);
    const replace = m === "registered" || m === "migrated";
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url.pathname + url.search);
  }, []);
  useEffect(() => {
    const read = () => {
      const m = new URLSearchParams(window.location.search).get("mode") as Mode | null;
      setModeState(m && URL_MODES.includes(m) ? m : "start");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  // null = 유형 선택(1단계). 고르면 정보 입력(2단계)으로 넘어간다.
  const [regType, setRegType] = useState<RegType | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  const [loginState, loginFormAction] = useActionState<ActionState, FormData>(loginAction, null);
  const [registerState, registerFormAction] = useActionState<ActionState, FormData>(registerAction, null);
  const [resetState, resetFormAction] = useActionState<ActionState, FormData>(requestPasswordResetAction, null);
  const [migrateState, migrateFormAction] = useActionState<ActionState, FormData>(migrateToEmailLoginAction, null);

  // 세션 만료로 튕겨나온 경우 middleware 가 `?next=<원래 경로>` 를 붙여 보낸다.
  // 이를 로그인 폼에 실어 보내 로그인 후 그 화면으로 복귀시킨다.
  // (useSearchParams 는 프리렌더 시 Suspense 경계를 요구하므로 마운트 후 직접 읽는다)
  const [next, setNext] = useState("");
  // /session-expired 를 거쳐 오면 ?expired=1 이 붙는다. 만료 안내를 띄우는 데 쓴다.
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNext(n ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpired(q.get("expired") === "1");
    // 세션 만료로 돌아온 사람은 바로 로그인 화면으로 보낸다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (n || q.get("expired") === "1") setModeState("login");
  }, []);

  // 가입·이메일 등록에 성공하면 안내 화면으로 넘어간다.
  // 의존성을 success 불리언으로 두면 두 번째 성공(true → true)에서 효과가 돌지 않으므로 상태 객체를 쓴다.
  useEffect(() => {
    if (registerState?.success) setMode("registered");
  }, [registerState]);
  useEffect(() => {
    if (migrateState?.success) setMode("migrated");
  }, [migrateState]);

  const back = (to: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(to)}
      className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors mb-4 inline-flex items-center gap-1"
    >
      ← {label}
    </button>
  );

  const SUBTITLE: Record<Mode, string> = {
    start: "AI 서비스를 평가하고 보상을 받는 곳",
    login: "이메일로 로그인하세요",
    help: "어떤 상황이신가요?",
    reset: "비밀번호 재설정",
    resend: "인증 메일 다시 받기",
    migrate: "로그인용 이메일 등록",
    migrated: "이메일 등록 완료",
    register: "회원가입",
    registered: "가입 완료",
  };

  return (
    // 폰에서 하단의 앱 설치 안내가 폼 끝을 가리지 않도록 아래 여백을 둔다.
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 pt-6 pb-28 sm:p-6">
      <div className="w-full max-w-[440px]">
        <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">AI 평가단</h1>
          <p className="text-sm text-[var(--muted)] mb-7">{SUBTITLE[mode]}</p>

          {/* 시작 */}
          {mode === "start" && (
            <div className="space-y-2.5">
              <ChoiceCard
                primary
                label="로그인"
                desc="이미 계정이 있어요"
                icon="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
                onClick={() => setMode("login")}
              />
              <ChoiceCard
                label="회원가입"
                desc="처음 오셨나요? 계정을 만드세요"
                icon="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6"
                onClick={() => {
                  setRegType(null);
                  setMode("register");
                }}
              />
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setMode("help")}
                  className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                  로그인이 안 되시나요?
                </button>
              </div>
            </div>
          )}

          {/* 로그인 */}
          {mode === "login" && (
            <>
              {back("start", "처음으로")}
              {/* 만료 안내는 오류가 아니므로 info 톤 */}
              {expired && (
                <div className="mb-3 text-sm text-[var(--gray-700)] bg-[var(--accent-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                  <p className="font-semibold mb-0.5">로그인이 만료되어 로그아웃되었습니다.</p>
                  <p className="text-[13px] text-[var(--gray-600)]">
                    한동안 사용하지 않으셨거나, 비밀번호 변경·다른 기기 로그아웃으로 로그인이
                    해제되었습니다. 다시 로그인해 주세요.
                  </p>
                </div>
              )}
              <form key="login" action={loginFormAction} className="space-y-3">
                <input type="hidden" name="next" value={next} />
                <div>
                  <label htmlFor="login-email" className={LABEL}>
                    이메일
                  </label>
                  {/* 로그인 ID 는 이메일이다. 학번·사번은 loginAction 이 안내 문구와 함께 거절한다. */}
                  <input
                    id="login-email"
                    name="studentId"
                    // type="email" 이면 브라우저가 @ 없는 값을 막아 서버의 학번 안내가 뜨지 않는다.
                    type="text"
                    inputMode="email"
                    required
                    autoComplete="username"
                    placeholder="example@hallym.ac.kr"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className={LABEL}>
                    비밀번호
                  </label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="비밀번호 입력"
                    className={INPUT}
                  />
                </div>

                {loginState?.error && (
                  <div className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                    <p>{loginState.error}</p>
                    {/* 오류에 맞는 복구 화면으로 바로 가는 버튼(help 화면에도 같은 경로가 있다) */}
                    {loginState.error === LEGACY_ID_ERROR && (
                      <button
                        type="button"
                        onClick={() => setMode("migrate")}
                        className="mt-2 w-full py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-white border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                      >
                        로그인용 이메일 등록하기
                      </button>
                    )}
                    {loginState.error === EMAIL_UNVERIFIED_ERROR && (
                      <button
                        type="button"
                        onClick={() => setMode("resend")}
                        className="mt-2 w-full py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-white border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                      >
                        인증 메일 다시 받기
                      </button>
                    )}
                  </div>
                )}

                <SubmitButton pendingText="로그인 중…" className={`${BTN_PRIMARY} mt-2`}>로그인</SubmitButton>
              </form>

              <div className="flex items-center justify-center pt-4">
                <button
                  type="button"
                  onClick={() => setMode("help")}
                  className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                >
                  로그인이 안 되시나요?
                </button>
              </div>
            </>
          )}

          {/* 도움말: 복구 경로 선택 */}
          {mode === "help" && (
            <div className="space-y-2.5">
              {back("login", "로그인으로")}
              <ChoiceCard
                label="비밀번호를 잊었어요"
                desc="새 비밀번호를 정하는 링크를 메일로 받습니다 (30분 유효)"
                icon="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM12 8v4M12 16h.01"
                onClick={() => setMode("reset")}
              />
              <ChoiceCard
                label="인증 메일을 못 받았어요"
                desc="가입할 때 온 이메일 인증 링크를 다시 받습니다 (24시간 유효)"
                icon="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6"
                onClick={() => setMode("resend")}
              />
              {/* 이메일이 없는 기존 회원이 들어올 수 있는 경로 */}
              <ChoiceCard
                label="학번·사번만 있고 이메일이 없어요"
                desc="기존 계정에 로그인용 이메일을 등록합니다 (학번·사번 + 비밀번호 필요)"
                icon="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                onClick={() => setMode("migrate")}
              />
              <p className="text-xs text-[var(--gray-500)] leading-relaxed pt-2">
                비밀번호도 이메일도 없으시면 관리자에게 문의해 주세요 — 본인 확인 후 임시
                비밀번호를 발급해 드립니다.
              </p>
            </div>
          )}

          {/* 비밀번호 재설정 */}
          {mode === "reset" && (
            <>
              {back("help", "도움말로")}
              {/* 인증 메일 재발송 화면과 생김새가 같아서 어떤 메일인지 먼저 밝힌다. */}
              <Alert tone="info">
                <strong>새 비밀번호를 정하는 링크</strong>를 가입 이메일로 보냅니다. 링크는{" "}
                <strong>30분</strong> 동안 유효합니다. 비밀번호는 링크를 눌러야 바뀝니다.
              </Alert>
              <form key="reset" action={resetFormAction} className="space-y-3 mt-3">
                <div>
                  <label htmlFor="reset-identifier" className={LABEL}>
                    이메일
                  </label>
                  <p className="text-xs text-[var(--gray-500)] mb-1.5">
                    학번·사번으로도 찾을 수 있습니다.
                  </p>
                  <input
                    id="reset-identifier"
                    name="identifier"
                    required
                    autoComplete="username"
                    placeholder="example@hallym.ac.kr"
                    className={INPUT}
                  />
                </div>
                {resetState?.error && <Alert tone="error">{resetState.error}</Alert>}
                {/* 가입 여부가 드러나지 않도록 계정 유무와 관계없이 같은 문구 */}
                {resetState?.success && (
                  <Alert tone="success">
                    해당 계정이 있다면 가입 이메일로 재설정 링크를 보냈습니다. 메일함(스팸함
                    포함)을 확인해 주세요.
                  </Alert>
                )}
                <SubmitButton pendingText="보내는 중…" className={`${BTN_PRIMARY} mt-2`}>재설정 링크 받기</SubmitButton>
              </form>
            </>
          )}

          {/* 인증 메일 재발송 */}
          {mode === "resend" && (
            <>
              {back("help", "도움말로")}
              <Alert tone="info">
                <strong>가입 이메일 인증</strong> 메일을 다시 보냅니다. 링크는{" "}
                <strong>24시간</strong> 동안 유효합니다. <strong>비밀번호는 바뀌지 않습니다.</strong>
              </Alert>
              <div className="mt-3">
                <ResendForm />
              </div>
            </>
          )}

          {/* 이메일 등록(학번·사번만 있는 기존 회원). 본인 확인은 비밀번호로 한다. */}
          {mode === "migrate" && (
            <>
              {back("help", "도움말로")}
              <Alert tone="info">
                기존 계정에 <strong>로그인용 이메일을 등록</strong>합니다. 본인 확인을 위해
                지금까지 쓰시던 <strong>학번·사번과 비밀번호</strong>가 필요합니다.
                비밀번호는 바뀌지 않습니다.
              </Alert>
              <form key="migrate" action={migrateFormAction} className="space-y-5 mt-4">
                <Group title="본인 확인">
                  <div>
                    <label htmlFor="mig-legacyId" className={LABEL}>
                      학번 · 사번 <Req />
                    </label>
                    <input
                      id="mig-legacyId"
                      name="legacyId"
                      required
                      placeholder="20240001 / AB1234"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor="mig-password" className={LABEL}>
                      기존 비밀번호 <Req />
                    </label>
                    <input
                      id="mig-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="비밀번호 입력"
                      className={INPUT}
                    />
                  </div>
                </Group>

                <Group title="새 로그인 ID">
                  <div>
                    <label htmlFor="mig-email" className={LABEL}>
                      이메일 <Req />
                    </label>
                    <p className="text-xs text-[var(--gray-500)] mb-1.5">
                      앞으로 이 주소가 로그인 ID 가 됩니다.
                    </p>
                    <input
                      id="mig-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="example@hallym.ac.kr"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor="mig-emailConfirm" className={LABEL}>
                      이메일 확인 <Req />
                    </label>
                    <input
                      id="mig-emailConfirm"
                      name="emailConfirm"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="한 번 더 입력해 주세요"
                      className={INPUT}
                    />
                  </div>
                </Group>

                {migrateState?.error && <Alert tone="error">{migrateState.error}</Alert>}
                <SubmitButton pendingText="보내는 중…" className={BTN_PRIMARY}>이메일 등록하고 인증 메일 받기</SubmitButton>
              </form>
            </>
          )}

          {/* 회원가입 1단계: 유형 선택 */}
          {mode === "register" && regType === null && (
            <>
              {back("start", "처음으로")}
              <Steps current={1} />
              <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
                어떤 자격으로 참여하시나요? 선택에 따라 입력할 항목이 달라집니다.
              </p>
              <div className="space-y-2.5">
                {REG_TYPES.map((t) => (
                  <ChoiceCard
                    key={t.key}
                    label={t.label}
                    desc={t.desc}
                    icon={t.icon}
                    onClick={() => setRegType(t.key)}
                  />
                ))}
              </div>
            </>
          )}

          {/* 회원가입 2단계: 정보 입력 */}
          {mode === "register" && regType !== null && (
            <>
              <button
                type="button"
                onClick={() => setRegType(null)}
                className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors mb-4 inline-flex items-center gap-1"
              >
                ← {REG_TYPES.find((t) => t.key === regType)?.label} · 유형 다시 선택
              </button>
              <Steps current={2} />

              <form
                key={`register-${regType}`}
                action={registerFormAction}
                onSubmit={(e) => {
                  if (!privacyAgreed) {
                    e.preventDefault();
                    toast("개인정보 수집 및 이용에 동의해 주세요.", "error");
                  }
                }}
                className="space-y-6"
              >
                <input type="hidden" name="userType" value={regType} />

                <Group title="기본 정보">
                  <div>
                    <label htmlFor="reg-name" className={LABEL}>
                      이름 <Req />
                    </label>
                    <input
                      id="reg-name"
                      name="name"
                      placeholder="홍길동"
                      required
                      autoComplete="name"
                      className={INPUT}
                    />
                    <p className="text-xs text-[var(--danger)] mt-1">
                      반드시 실명을 입력해 주세요.
                    </p>
                  </div>
                  <div>
                    <label className={LABEL}>
                      전화번호 <Req />
                    </label>
                    <PhoneInput name="phone" required />
                  </div>
                </Group>

                <Group title={regType === "DEVELOPER" ? "소속 기업" : "소속 정보"}>
                  {regType === "STUDENT" && (
                    <>
                      <div>
                        <label htmlFor="reg-studentId" className={LABEL}>
                          학번 <Req />
                        </label>
                        <input
                          id="reg-studentId"
                          name="studentId"
                          placeholder="20240001"
                          required
                          inputMode="numeric"
                          className={INPUT}
                        />
                      </div>
                      <div>
                        <label className={LABEL}>
                          전공 <Req />
                        </label>
                        {/* 항목이 100개가 넘어 검색형으로 고른다 */}
                        <MajorSelect name="major" required />
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
                        <p className="text-xs text-[var(--gray-500)] mt-1">
                          영문·숫자만, 최대 8자리
                        </p>
                      </div>
                      <div>
                        <label className={LABEL}>
                          소속 <Req />
                        </label>
                        <MajorSelect
                          name="major"
                          required
                          placeholder="소속을 검색하세요 (예: 정보과학, 간호)"
                        />
                      </div>
                    </>
                  )}

                  {regType === "DEVELOPER" && (
                    <div>
                      <label htmlFor="reg-companyName" className={LABEL}>
                        업체명 <Req />
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
                        사업자등록번호는 나중에 프로필에서 등록합니다 — 발주·견적서에 필요합니다.
                      </p>
                    </div>
                  )}
                </Group>

                <Group title="로그인 정보">
                  {/* 게스트는 devEmail 로 받고 registerAction 이 email 에도 넣는다. */}
                  <div>
                    <label
                      htmlFor={regType === "DEVELOPER" ? "reg-devEmail" : "reg-email"}
                      className={LABEL}
                    >
                      이메일 (로그인 ID) <Req />
                    </label>
                    <input
                      id={regType === "DEVELOPER" ? "reg-devEmail" : "reg-email"}
                      name={regType === "DEVELOPER" ? "devEmail" : "email"}
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={
                        regType === "DEVELOPER" ? "you@company.com" : "example@hallym.ac.kr"
                      }
                      className={INPUT}
                    />
                    <p className="text-xs text-[var(--gray-500)] mt-1 leading-relaxed">
                      <strong>가입 후 이 주소로 인증 메일이 갑니다.</strong> 링크를 눌러야
                      로그인할 수 있으니 받을 수 있는 주소를 넣어 주세요.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="reg-password" className={LABEL}>
                      비밀번호 <Req />
                    </label>
                    <input
                      id="reg-password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="8자 이상"
                      className={INPUT}
                    />
                  </div>
                </Group>

                {/* 개인정보 동의 */}
                <div className="border-t border-[var(--gray-200)] pt-5 space-y-3">
                  <div className="text-xs text-[var(--gray-500)] leading-relaxed space-y-1">
                    <p>
                      <strong className="text-[var(--gray-700)]">수집 항목</strong> · 이름,
                      전화번호, 이메일
                      {regType === "STUDENT" && ", 학번, 전공"}
                      {regType === "STAFF" && ", 사번, 소속"}
                      {regType === "DEVELOPER" && ", 업체명"}
                    </p>
                    <p>
                      <strong className="text-[var(--gray-700)]">수집 목적</strong> · 서비스 이용,
                      본인 확인, 비밀번호 찾기
                      {regType !== "DEVELOPER" && ", 보상 지급"}
                    </p>
                    <p>
                      <strong className="text-[var(--gray-700)]">보유 기간</strong> · 회원 탈퇴
                      시까지
                    </p>
                    {/* 접속기록은 법령에 따른 수집이라 동의 대상이 아니다. 보관기간은 accessLog.ts 와 맞춘다. */}
                    <p>
                      <strong className="text-[var(--gray-700)]">자동 수집(안내)</strong> · 로그인·개인정보
                      처리 시 접속 IP·일시·브라우저 정보를 접속기록으로 남기며, 관련 법령에 따라 2년간
                      보관합니다.
                    </p>
                    <p className="text-[var(--gray-500)]">
                      동의하지 않으실 수 있으며, 그 경우 서비스 이용이 제한됩니다.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyAgreed}
                      onChange={(e) => setPrivacyAgreed(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--accent)]"
                    />
                    <span className="text-xs font-medium text-[var(--gray-700)]">
                      개인정보 수집 및 이용에 동의합니다. <Req />
                    </span>
                  </label>
                </div>

                {registerState?.error && <Alert tone="error">{registerState.error}</Alert>}
                <SubmitButton
                  pendingText="가입 처리 중…"
                  className={`w-full py-2.5 rounded-[var(--radius-md)] font-semibold text-sm transition-all ${
                    privacyAgreed
                      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] active:scale-[0.98]"
                      : "bg-[var(--gray-200)] text-[var(--gray-500)] cursor-not-allowed"
                  }`}
                >
                  회원가입
                </SubmitButton>
              </form>
            </>
          )}

          {/* 완료 화면: 인증 메일 확인 안내 */}
          {(mode === "registered" || mode === "migrated") && (
            <div className="space-y-4">
              {mode === "registered" && <Steps current={3} />}
              <div className="flex items-start gap-3 p-4 rounded-[var(--radius-lg)] bg-[var(--success-light)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-0.5 text-[var(--success)]"
                  aria-hidden
                >
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--success)]">
                    {mode === "registered" ? "가입이 완료되었습니다" : "이메일을 등록했습니다"}
                  </p>
                  <p className="text-[13px] text-[var(--gray-700)] leading-relaxed mt-1">
                    입력하신 주소로 <strong>인증 링크</strong>를 보냈습니다. 링크를 눌러야
                    로그인할 수 있습니다.
                  </p>
                </div>
              </div>

              <ul className="text-xs text-[var(--gray-500)] leading-relaxed space-y-1 list-disc pl-4">
                <li>
                  메일이 안 보이면 <strong>스팸함</strong>을 확인해 주세요.
                </li>
                <li>링크는 24시간 동안 유효합니다.</li>
                <li>
                  못 받으셨다면{" "}
                  <button
                    type="button"
                    onClick={() => setMode("resend")}
                    className="underline text-[var(--accent)] hover:opacity-80"
                  >
                    인증 메일 다시 받기
                  </button>
                  를 이용하세요.
                </li>
              </ul>

              <button type="button" onClick={() => setMode("login")} className={BTN_PRIMARY}>
                로그인 화면으로
              </button>
            </div>
          )}
        </div>

        {/* 카드 아래 보조 링크 */}
        <div className="text-center mt-4">
          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setRegType(null);
                setMode("register");
              }}
              className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            >
              계정이 없으신가요? 회원가입
            </button>
          )}
          {mode === "register" && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            >
              이미 계정이 있으신가요? 로그인
            </button>
          )}
          {/* 복구 화면에서 로그인으로 바로 돌아가는 링크 */}
          {(mode === "help" || mode === "reset" || mode === "resend" || mode === "migrate") && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            >
              로그인으로 돌아가기
            </button>
          )}
        </div>

        {/* 1320px 미만에서는 카드 아래 접힌 목록으로 보인다(스테이징 전용). */}
        <DemoAccountsPanel compact />
      </div>

      {/* 스테이징 전용. 운영에서는 아무것도 렌더되지 않는다. */}
      <DemoAccountsPanel />
    </main>
  );
}
