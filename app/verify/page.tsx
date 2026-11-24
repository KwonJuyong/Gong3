import Link from "next/link";
import { BTN_PRIMARY } from "../AuthParts";
import { consumeVerificationToken } from "../lib/emailVerification";
import ResendForm from "./ResendForm";

export const metadata = { title: "이메일 인증" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const r = await consumeVerificationToken(token || "");

  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-6 sm:p-6">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">
            AI 평가단
          </h1>
          <p className="text-sm text-[var(--muted)] mb-8">이메일 인증</p>

          {r.ok ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                {r.alreadyDone
                  ? "이미 인증이 완료된 계정입니다. 그대로 로그인하세요."
                  : "이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다."}
              </p>
              <Link href="/" className={BTN_PRIMARY}>
                로그인하기
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
                {r.reason === "expired"
                  ? "인증 링크가 만료되었습니다. 발송 후 24시간까지만 유효합니다."
                  : r.reason === "used"
                    ? "이미 사용된 링크입니다."
                    : r.reason === "email-changed"
                      ? "이 링크가 인증하려던 주소와 현재 등록된 이메일이 다릅니다. 새 주소로 받은 링크를 사용해 주세요."
                      : "인증 링크가 올바르지 않습니다."}
              </p>
              <div className="pt-1 border-t border-[var(--gray-100)]">
                <p className="text-xs text-[var(--muted)] leading-relaxed mt-4 mb-3">
                  아래에 학번·사번 또는 이메일을 입력하면 인증 메일을 다시 보내드립니다.
                </p>
                <ResendForm />
              </div>
              <Link
                href="/"
                className="block text-center text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
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
