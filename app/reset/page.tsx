import Link from "next/link";
import { BTN_PRIMARY } from "../AuthParts";
import { checkResetToken } from "../lib/passwordReset";
import ResetForm from "./ResetForm";

export const metadata = { title: "비밀번호 재설정" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = await checkResetToken(token || "");

  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-6 sm:p-6">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-8">
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
              <Link href="/?mode=reset" className={BTN_PRIMARY}>
                재설정 링크 다시 받기
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
