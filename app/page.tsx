"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SubmitButton from "./components/SubmitButton";
import PasswordInput from "./components/PasswordInput";
import { useFormSubmit } from "./components/useFormSubmit";
import { loginAction, requestPasswordResetAction, migrateToEmailLoginAction } from "./actions";
import ResendForm from "./verify/ResendForm";
import DemoAccountsPanel from "./components/DemoAccountsPanel";
import RegisterForm, { type RegType } from "./RegisterForm";
import { Alert, BTN_PRIMARY, ChoiceCard, Group, INPUT, LABEL, Req, Steps } from "./AuthParts";
import { EMAIL_UNVERIFIED_ERROR, LEGACY_ID_ERROR, LOGIN_FAILED_ERROR } from "./lib/authMessages";

/**
 * 로그인 · 회원가입 · 계정 복구 화면.
 *
 * start(로그인) ─┬─ 로그인이 안 되시나요? → help ─┬─ 비밀번호 재설정       → reset
 *                 │                                ├─ 인증 메일 재발송      → resend
 *                 │                                └─ 이메일 등록(학번만)   → migrate
 *                 └─ 회원가입 ── 1 유형 선택 ── 2 정보 입력 ── 3 인증 메일 안내
 *
 * 복구 경로는 로그인에 실패하지 않아도 help 화면에서 항상 고를 수 있게 둠
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

/** 가입 유형. 유형에 따라 입력 칸이 달라지므로 이 선택만 별도 단계로 둠 */
const REG_TYPES: { key: RegType; label: string; desc: string; icon: string }[] = [
  {
    key: "STUDENT",
    label: "학생 평가자",
    desc: "AI 서비스를 평가하고 보상을 받는 한림대 학생",
    icon: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c3 3 9 3 12 0v-5",
  },
  {
    key: "DEVELOPER",
    label: "기업 · 외부 기관",
    desc: "평가를 의뢰하거나 자사 서비스를 등록하려는 분",
    icon: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01",
  },
  {
    key: "STAFF",
    label: "교직원 · 조교",
    desc: "연구·수업 목적으로 평가를 개설하는 교내 구성원",
    icon: "M20 7h-9M14 17H5M17 21a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  },
];

/** ?mode= 로 바로 열 수 있는 화면. 성공 화면은 제외함 */
const URL_MODES: Mode[] = ["login", "help", "reset", "resend", "migrate", "register"];

export default function Page() {
  const [mode, setModeState] = useState<Mode>("start");
  // 화면 단계를 ?mode= 에 실어 뒤로가기·새로고침이 동작하게 함
  // 성공 화면은 replace 로 바꿔 뒤로가기로 제출한 폼에 돌아가지 않게 함
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
  // null = 유형 선택(1단계). 고르면 정보 입력(2단계)으로 넘어감
  const [regType, setRegType] = useState<RegType | null>(null);
  // 가입·등록·로그인에 쓴 주소를 다음 화면(로그인·재발송·재설정) 입력칸에 미리 채움
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const migrateEmail = useRef("");

  const [loginState, loginForm, loginPending] = useFormSubmit(loginAction);
  const [resetState, resetForm, resetPending] = useFormSubmit(requestPasswordResetAction);
  const [migrateState, migrateForm, migratePending] = useFormSubmit(migrateToEmailLoginAction);

  // 세션 만료로 튕겨나온 경우 proxy 가 `?next=<원래 경로>` 를 붙여 보냄
  // 이를 로그인 폼에 실어 보내 로그인 후 그 화면으로 복귀시킴
  // (useSearchParams 는 프리렌더 시 Suspense 경계를 요구하므로 마운트 후 직접 읽음)
  const [next, setNext] = useState("");
  // /session-expired 를 거쳐 오면 ?expired=1 이 붙음. 만료 안내를 띄우는 데 씀
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNext(n ?? "");
    setExpired(q.get("expired") === "1");
    // 세션 만료로 돌아온 사람은 바로 로그인 화면으로 보냄
    if (n || q.get("expired") === "1") setModeState("login");
  }, []);

  // 이메일 등록에 성공하면 안내 화면으로 넘어감
  // 의존성을 success 불리언으로 두면 두 번째 성공(true → true)에서 효과가 돌지 않으므로 상태 객체를 씀
  // setMode 가 주소창 기록도 바꿔 렌더 중 처리 불가
  useEffect(() => {
    if (!migrateState?.success) return;
    setEmail(migrateEmail.current);
    setMode("migrated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    login: "이메일로 로그인해 주세요",
    help: "어떤 상황이신가요?",
    reset: "비밀번호 재설정",
    resend: "인증 메일 다시 받기",
    migrate: "로그인용 이메일 등록",
    migrated: "이메일 등록 완료",
    register: "회원가입",
    registered: "가입 완료",
  };

  return (
    // 폰에서 하단의 앱 설치 안내가 폼 끝을 가리지 않도록 아래 여백을 둠
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 pt-6 pb-28 sm:p-6">
      <div className="w-full max-w-[440px]">
        <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">AI 평가단</h1>
          <p className="text-sm text-[var(--muted)] mb-7">{SUBTITLE[mode]}</p>

          {/* 가장 많이 쓰는 로그인을 첫 화면에 바로 둠 */}
          {(mode === "start" || mode === "login") && (
            <>
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
              <form key="login" {...loginForm} className="space-y-3">
                <input type="hidden" name="next" value={next} />
                <div>
                  <label htmlFor="login-email" className={LABEL}>
                    이메일
                  </label>
                  {/* 로그인 ID 는 이메일임. 학번·사번은 loginAction 이 안내 문구와 함께 거절함 */}
                  <input
                    id="login-email"
                    name="studentId"
                    // type="email" 이면 브라우저가 @ 없는 값을 막아 서버의 학번 안내가 뜨지 않음
                    type="text"
                    inputMode="email"
                    required
                    autoComplete="username"
                    placeholder="example@hallym.ac.kr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className={LABEL}>
                    비밀번호
                  </label>
                  <PasswordInput
                    id="login-password"
                    name="password"
                    required
                    autoComplete="current-password"
                    placeholder="비밀번호 입력"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT}
                  />
                </div>

                {loginState?.error && (
                  <div role="alert" className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                    <p>{loginState.error}</p>
                    {/* 오류에 맞는 복구 화면으로 바로 가는 버튼(help 화면에도 같은 경로가 있음) */}
                    {loginState.error === LEGACY_ID_ERROR && (
                      <button
                        type="button"
                        onClick={() => setMode("migrate")}
                        className="mt-2 w-full py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-white border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                      >
                        로그인용 이메일 등록하기
                      </button>
                    )}
                    {loginState.error === LOGIN_FAILED_ERROR && (
                      <button
                        type="button"
                        onClick={() => setMode("reset")}
                        className="mt-2 w-full py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-white border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                      >
                        비밀번호 재설정
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

                <SubmitButton pending={loginPending} pendingText="로그인 중…" className={`${BTN_PRIMARY} mt-2`}>로그인</SubmitButton>
              </form>

              <button
                type="button"
                onClick={() => {
                  setRegType(null);
                  setMode("register");
                }}
                className="mt-3 w-full py-2.5 rounded-[var(--radius-md)] bg-[var(--gray-100)] text-sm font-semibold text-[var(--gray-800)] hover:bg-[var(--gray-200)] transition-colors"
              >
                처음이신가요? 회원가입
              </button>

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
                비밀번호도 이메일도 없으시면 관리자에게 문의해 주세요. 본인 확인 후 임시
                비밀번호를 발급해 드립니다.
              </p>
            </div>
          )}

          {mode === "reset" && (
            <>
              {back("help", "도움말로")}
              {/* 인증 메일 재발송 화면과 생김새가 같아서 어떤 메일인지 먼저 밝힘 */}
              <Alert tone="info">
                <strong>새 비밀번호를 정하는 링크</strong>를 가입 이메일로 보냅니다. 링크는{" "}
                <strong>30분</strong> 동안 유효합니다. 비밀번호는 링크를 눌러야 바뀝니다.
              </Alert>
              <form key="reset" {...resetForm} className="space-y-3 mt-3">
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
                    defaultValue={email}
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
                <SubmitButton pending={resetPending} pendingText="보내는 중…" className={`${BTN_PRIMARY} mt-2`}>재설정 링크 받기</SubmitButton>
              </form>
            </>
          )}

          {mode === "resend" && (
            <>
              {back("help", "도움말로")}
              <Alert tone="info">
                <strong>가입 이메일 인증</strong> 메일을 다시 보냅니다. 링크는{" "}
                <strong>24시간</strong> 동안 유효합니다. <strong>비밀번호는 바뀌지 않습니다.</strong>
              </Alert>
              <div className="mt-3">
                <ResendForm defaultIdentifier={email} />
              </div>
            </>
          )}

          {/* 이메일 등록(학번·사번만 있는 기존 회원). 본인 확인은 비밀번호로 함 */}
          {mode === "migrate" && (
            <>
              {back("help", "도움말로")}
              <Alert tone="info">
                기존 계정에 <strong>로그인용 이메일을 등록</strong>합니다. 본인 확인을 위해
                지금까지 쓰시던 <strong>학번·사번과 비밀번호</strong>가 필요합니다.
                비밀번호는 바뀌지 않습니다.
              </Alert>
              <form
                key="migrate"
                action={migrateForm.action}
                onSubmit={(e) => {
                  migrateEmail.current = String(new FormData(e.currentTarget).get("email") ?? "").trim();
                  migrateForm.onSubmit(e);
                }}
                className="space-y-5 mt-4"
              >
                <Group title="본인 확인">
                  <div>
                    <label htmlFor="mig-legacyId" className={LABEL}>
                      학번 · 사번 <Req />
                    </label>
                    <input
                      id="mig-legacyId"
                      name="legacyId"
                      required
                      // 로그인 칸에 학번을 넣고 안내를 받아 넘어온 경우 그대로 이어 씀
                      defaultValue={email.includes("@") ? "" : email}
                      placeholder="20240001 / AB1234"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor="mig-password" className={LABEL}>
                      기존 비밀번호 <Req />
                    </label>
                    <PasswordInput
                      id="mig-password"
                      name="password"
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
                <SubmitButton pending={migratePending} pendingText="보내는 중…" className={BTN_PRIMARY}>이메일 등록하고 인증 메일 받기</SubmitButton>
              </form>
            </>
          )}

          {mode === "register" && regType === null && (
            <>
              {back("start", "로그인으로")}
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

              <RegisterForm
                key={regType}
                regType={regType}
                onRegistered={(addr) => {
                  setEmail(addr);
                  setMode("registered");
                }}
              />
            </>
          )}

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

        <div className="text-center mt-4">
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

        {/* 1320px 미만에서는 카드 아래 접힌 목록으로 보임(스테이징 전용). */}
        <DemoAccountsPanel
          compact
          activeEmail={email}
          onSelect={(selectedEmail, selectedPw) => {
            setMode("login");
            setEmail(selectedEmail);
            setPassword(selectedPw);
          }}
        />
      </div>

      {/* 스테이징 전용. 운영에서는 아무것도 렌더되지 않음 */}
      <DemoAccountsPanel
        activeEmail={email}
        onSelect={(selectedEmail, selectedPw) => {
          setMode("login");
          setEmail(selectedEmail);
          setPassword(selectedPw);
        }}
      />
    </main>
  );
}
