import Link from "next/link";
import { checkResetToken } from "../lib/passwordReset";
import ResetForm from "./ResetForm";

export const metadata = { title: "비밀번호 재설정" };

/**
 * 메일 링크로 들어오는 비밀번호 재설정 화면(/reset?token=...). 로그인 없이 씀
 * 만료된 링크를 미리 알리려고 화면 진입 때 토큰을 확인하고, 실제 검증은 제출 때
 * consumeResetToken 이 함
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = await checkResetToken(token || "");

  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--gray-200)] p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">
            AI 평가단
          </h1>
          <p className="text-sm text-[var(--muted)] mb-8">새 비밀번호 설정</p>

          {check.ok ? (
            <ResetForm token={token || ""} />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                {check.reason === "expired"
                  ? "링크가 만료되었습니다. 발송 후 30분까지만 유효합니다."
                  : check.reason === "used"
                    ? "이미 사용된 링크입니다."
                    : "재설정 링크가 올바르지 않습니다."}
              </p>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                로그인 화면에서 <strong>비밀번호를 잊으셨나요?</strong> 를 눌러 재설정을 다시
                요청해 주세요.
              </p>
              <Link
                href="/"
                className="block w-full text-center py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
              >
                로그인 화면으로
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
