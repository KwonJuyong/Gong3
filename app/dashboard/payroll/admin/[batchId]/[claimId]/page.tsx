import { logPersonalData } from "@/app/lib/accessLog";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../../db";
import { regenerateClaim } from "../../../actions";
import ClaimEditor, { type FormEntry } from "./ClaimEditor";

export const metadata = { title: "청구서 검토" };

export default async function ClaimEditPage({
  params,
}: {
  params: Promise<{ batchId: string; claimId: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard/payroll");

  const { batchId, claimId } = await params;
  const claim = await prisma.laborClaim.findUnique({
    where: { id: claimId },
    include: { user: { select: { studentId: true, name: true } } },
  });
  if (!claim || claim.batchId !== batchId) redirect(`/dashboard/payroll/admin/${batchId}`);
  // 접속기록: 청구서(주민번호·계좌 포함) 열람
  await logPersonalData(me.id, "VIEW", "노무비 청구서 검토", claim.userId);

  const entries: FormEntry[] = Array.isArray(claim.entries)
    ? (claim.entries as any[]).map((e) => ({
        date: String(e?.date || ""),
        start: String(e?.start || ""),
        end: String(e?.end || ""),
        content: String(e?.content || ""),
        amount: Number(e?.amount || 0),
      }))
    : [];
  if (entries.length === 0) {
    entries.push({ date: "", start: "", end: "", content: "", amount: 0 });
  }

  const consent = (claim.consent as any) || { personal: true, unique: true, thirdParty: true };

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8">
        <Link href={`/dashboard/payroll/admin/${batchId}`} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 회차 관리
        </Link>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">
              {claim.user?.name || claim.name} <span className="text-sm font-normal text-[var(--muted)]">({claim.user?.studentId})</span>
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">자동 생성된 서류를 검토·수정한 뒤 저장하세요.</p>
          </div>
          <form action={regenerateClaim}>
            <input type="hidden" name="claimId" value={claim.id} />
            <ConfirmButton
              message={"이 청구서의 개인정보·근무내역을 최신 프로필과 참여 기록으로 다시 만듭니다.\n\n· 이 화면에서 직접 고친 내용은 덮어써집니다.\n\n정말 재생성하시겠습니까?"}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--gray-100)]"
            >
              자동 재생성
            </ConfirmButton>
          </form>
        </div>

        <ClaimEditor
          claimId={claim.id}
          initialEntries={entries}
          initial={{
            affiliation: claim.affiliation || "",
            name: claim.name || claim.user?.name || "",
            phone: claim.phone || "",
            address: claim.address || "",
            bankName: claim.bankName || "",
            accountNumber: claim.accountNumber || "",
            signatureUrl: claim.signatureUrl || "",
            hasSavedRrn: !!claim.rrnEnc,
            consent: {
              personal: !!consent.personal,
              unique: !!consent.unique,
              thirdParty: !!consent.thirdParty,
            },
            confirmed: claim.status === "CONFIRMED",
          }}
        />
      </main>
    </div>
  );
}
