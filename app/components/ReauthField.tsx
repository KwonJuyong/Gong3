/**
 * 민감 조작 폼의 비밀번호 재확인 칸. 서버는 checkReauth()(app/lib/reauth.ts)로 같은 이름의 값을 확인함
 * 서버 컴포넌트 페이지의 폼에도 그대로 넣을 수 있도록 상태를 두지 않음
 */
export const REAUTH_FIELD = "reauthPassword";

export default function ReauthField({ className = "" }: { className?: string }) {
  return (
    <input
      type="password"
      name={REAUTH_FIELD}
      required
      autoComplete="current-password"
      placeholder="내 비밀번호 (본인 확인)"
      aria-label="본인 확인용 내 비밀번호"
      className={`px-3 py-2 text-sm bg-white border border-[var(--gray-300)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent)] ${className}`}
    />
  );
}
