import { redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { getSessionUser } from "../db";
import EmailSetupForm from "./EmailSetupForm";

export const metadata = { title: "이메일 등록" };

/**
 * 로그인한 상태에서 이메일이 없는 계정에 주소를 받는 화면(/email-setup).
 * 이메일 없이 로그인해 둔 세션으로 대시보드에 들어오면 dashboard/layout.tsx 가 여기로 보냄
 * 로그인 전 사용자는 로그인 화면의 이메일 등록(migrateToEmailLoginAction)을 씀
 *
 * 세션으로 본인이 확인됐으므로 emailVerifiedAt 은 건드리지 않음
 * dashboard/layout 이 이 화면으로 보내므로 /dashboard 아래에 두면 루프가 생김
 */
export default async function EmailSetupPage() {
  const me = await getSessionUser();
  if (!me) redirectToLogin();
  // 이미 이메일이 있으면 대시보드로 보냄
  if (me.email) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="w-full max-w-[460px]">
        <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--gray-200)] p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">
            AI 평가단
          </h1>
          <p className="text-sm text-[var(--muted)] mb-6">이메일 등록</p>

          <div className="text-sm text-[var(--gray-700)] leading-relaxed bg-[var(--accent-light)] px-4 py-3.5 rounded-[var(--radius-md)] mb-6">
            <p className="font-semibold mb-1.5">
              {me.name}님, 계정에 등록된 이메일이 없습니다.
            </p>
            <p className="text-[13px] text-[var(--gray-600)]">
              로그인 방식이 <strong>이메일</strong>로 바뀌었습니다.{" "}
              <strong>지금 등록하지 않으면 다음 로그인부터 들어오실 수 없습니다.</strong>{" "}
              비밀번호를 잊으셨을 때 되찾을 주소도 이 이메일입니다.
            </p>
          </div>

          <EmailSetupForm />

          <p className="text-xs text-[var(--gray-500)] leading-relaxed mt-5 pt-4 border-t border-[var(--gray-100)]">
            학번·사번 <strong>{me.studentId}</strong> 로는 더 이상 로그인할 수 없습니다.
            비밀번호는 그대로이니, 등록하신 이메일과 지금 쓰시는 비밀번호로 로그인하시면
            됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
