import Link from "next/link";
import { lookupClaimToken } from "@/app/lib/accountClaim";
import ClaimForm from "./ClaimForm";

export const metadata = { title: "청구 확인서 서명" };

/**
 * 계정 인계 화면(/claim/<토큰>). 이메일이 없는 기존 계정을 복구하는 경로다(app/lib/accountClaim.ts).
 *
 * 로그인을 요구하지 않고 URL 의 토큰으로 판정한다(DB 에는 해시만 저장).
 * 토큰은 추측할 수 없는 난수라 실패 사유를 구분해 보여준다.
 */
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await lookupClaimToken(token);

  const shell = (title: string, body: React.ReactNode) => (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="w-full max-w-[460px]">
        <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--gray-200)] p-8">
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-1 tracking-tight">
            AI 평가단
          </h1>
          <p className="text-sm text-[var(--muted)] mb-6">{title}</p>
          {body}
        </div>
      </div>
    </main>
  );

  if (!found.ok) {
    const MSG: Record<typeof found.reason, { head: string; desc: string }> = {
      invalid: {
        head: "링크를 확인할 수 없습니다.",
        desc: "주소가 잘린 채 전달되었을 수 있습니다. 받으신 메시지의 링크를 다시 눌러 주세요. 그래도 안 되면 관리자에게 재발급을 요청해 주세요.",
      },
      expired: {
        head: "링크 사용 기간이 지났습니다.",
        desc: "보안을 위해 발급 후 7일이 지나면 자동으로 만료됩니다. 관리자에게 재발급을 요청해 주세요.",
      },
      used: {
        head: "이미 사용된 링크입니다.",
        desc: "등록을 이미 마치셨다면 로그인 화면에서 등록하신 이메일로 로그인해 주세요. 본인이 쓴 기억이 없다면 관리자에게 알려 주세요.",
      },
      done: {
        head: "이미 이메일이 등록된 계정입니다.",
        desc: "로그인 화면에서 등록된 이메일로 로그인해 주세요. 비밀번호가 기억나지 않으면 「로그인이 안 되시나요?」에서 재설정할 수 있습니다.",
      },
    };
    const m = MSG[found.reason];
    return shell(
      "계정 등록",
      <>
        <div className="text-sm text-[var(--gray-700)] leading-relaxed bg-[var(--danger-light)] px-4 py-3.5 rounded-[var(--radius-md)] mb-5">
          <p className="font-semibold mb-1.5 text-[var(--danger)]">{m.head}</p>
          <p className="text-[13px]">{m.desc}</p>
        </div>
        <Link
          href="/"
          className="block w-full py-2.5 text-center bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
        >
          로그인 화면으로
        </Link>
      </>,
    );
  }

  // 본인 계정인지 확인할 수 있게 학번은 뒤 3자리만 가린다.
  const masked =
    found.studentId.length > 3
      ? found.studentId.slice(0, -3) + "***"
      : found.studentId;

  return shell(
    "계정 등록",
    <>
      <div className="text-sm text-[var(--gray-700)] leading-relaxed bg-[var(--accent-light)] px-4 py-3.5 rounded-[var(--radius-md)] mb-6">
        <p className="font-semibold mb-1.5">
          {found.name}님 ({masked}) 계정입니다.
        </p>
        <p className="text-[13px] text-[var(--gray-600)]">
          로그인 방식이 이메일로 바뀌었습니다. 아래에 쓰실 이메일과 새 비밀번호를 한 번만
          정해 주시면 바로 들어가실 수 있습니다. 기존 참여 기록과 보상 내역은 그대로
          유지됩니다.
        </p>
      </div>
      <ClaimForm token={token} />
      <p className="text-xs text-[var(--gray-500)] mt-4 leading-relaxed">
        본인이 아니시라면 이 화면을 닫고 관리자에게 알려 주세요. 이 링크는 한 번만 쓸 수
        있고 7일이 지나면 만료됩니다.
      </p>
    </>,
  );
}
