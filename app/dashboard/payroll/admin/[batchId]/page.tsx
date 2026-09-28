import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../db";
import { setBatchStatus, generateClaims } from "../../actions";
import AdminClaimRow from "./AdminClaimRow";

export const metadata = { title: "청구 회차 관리" };

function fmtDate(d: Date) {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

export default async function PayrollAdminPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard/payroll");

  const { batchId } = await params;
  const batch = await prisma.claimBatch.findUnique({
    where: { id: batchId },
    include: {
      claims: {
        include: { user: { select: { id: true, studentId: true, name: true } } },
        orderBy: { user: { studentId: "asc" } },
      },
    },
  });
  if (!batch) redirect("/dashboard/payroll");

  const totalSum = batch.claims.reduce((s, c) => s + (c.totalAmount || 0), 0);

  // 첨부를 내지 않은 사람을 ZIP 을 받기 전에 보여준다.
  const claimUserIds = batch.claims.map((c) => c.user?.id).filter((v): v is string => !!v);
  const atts = await prisma.attachment.findMany({
    where: { ownerId: { in: claimUserIds } },
    select: { ownerId: true, kind: true },
  });
  const haveIdCard = new Set(atts.filter((a) => a.kind === "ID_CARD").map((a) => a.ownerId));
  const haveBankbook = new Set(atts.filter((a) => a.kind === "BANKBOOK").map((a) => a.ownerId));
  const missingAttachments = batch.claims
    .map((c) => {
      const uid = c.user?.id;
      const lack: string[] = [];
      if (!uid || !haveIdCard.has(uid)) lack.push("신분증");
      if (!uid || !haveBankbook.has(uid)) lack.push("통장사본");
      return lack.length > 0 ? { name: c.user?.name || c.name, lack } : null;
    })
    .filter((v): v is { name: string; lack: string[] } => v !== null);

  const rows = batch.claims.map((c) => ({
    id: c.id,
    batchId: batch.id,
    studentId: c.user?.studentId || "",
    name: c.user?.name || c.name,
    status: c.status,
    totalAmount: c.totalAmount || 0,
    infoComplete: !!(c.rrnEnc && c.address && c.accountNumber),
  }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-5">
        <Link href="/dashboard/payroll" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 목록
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--foreground)]">{batch.title}</h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  batch.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {batch.status === "OPEN" ? "진행중" : "마감"}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] mt-1">
              근무기간 {fmtDate(batch.periodStart)} ~ {fmtDate(batch.periodEnd)} · 서류 {batch.claims.length}건 · 합계 {totalSum.toLocaleString("ko-KR")}원
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form action={generateClaims}>
              <input type="hidden" name="batchId" value={batch.id} />
              <ConfirmButton
                message={`근무기간(${fmtDate(batch.periodStart)} ~ ${fmtDate(batch.periodEnd)}) 참여자의 청구서를 자동으로 만듭니다.\n\n· 아직 청구서가 없는 사람 것만 새로 만듭니다.\n· 이 기간에 외부 의뢰형 평가(보상으로 이미 지급)가 있으면 그 근무도 들어갑니다 — 생성 후 근무내역을 확인하세요.\n\n정말 생성하시겠습니까?`}
                className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]"
              >
                참여자 서류 자동 생성
              </ConfirmButton>
            </form>
            <a
              href={`/api/payroll/export/${batch.id}`}
              className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--gray-100)]"
            >
              ZIP 내보내기
            </a>
            <form action={setBatchStatus}>
              <input type="hidden" name="batchId" value={batch.id} />
              <input type="hidden" name="status" value={batch.status === "OPEN" ? "CLOSED" : "OPEN"} />
              <ConfirmButton
                message={
                  batch.status === "OPEN"
                    ? `「${batch.title}」 회차를 마감으로 표시합니다.\n\n· 「회차 재개」로 다시 진행중으로 되돌릴 수 있습니다.\n\n정말 마감하시겠습니까?`
                    : `「${batch.title}」 회차를 다시 진행중으로 표시합니다.\n\n정말 재개하시겠습니까?`
                }
                className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--gray-100)]"
              >
                {batch.status === "OPEN" ? "회차 마감" : "회차 재개"}
              </ConfirmButton>
            </form>
          </div>
        </div>

        <section className="bg-white rounded-[var(--radius-xl)] p-5 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] text-center py-8">
              아직 생성된 서류가 없습니다. “참여자 서류 자동 생성”을 눌러 근무 기간 참여자의 청구서를 만드세요.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[var(--muted)] border-b border-[var(--gray-200)]">
                  <th className="py-2 px-2 text-left font-medium">학번</th>
                  <th className="py-2 px-2 text-left font-medium">성명</th>
                  <th className="py-2 px-2 text-left font-medium">상태</th>
                  <th className="py-2 px-2 text-right font-medium">합계</th>
                  <th className="py-2 px-2 text-center font-medium">정산정보</th>
                  <th className="py-2 px-2 text-left font-medium">서류</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <AdminClaimRow key={r.id} claim={r} />
                ))}
              </tbody>
            </table>
          )}
          {/* 빠진 첨부 안내 */}
          {rows.length > 0 && missingAttachments.length > 0 && (
            <div className="mt-4 text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
              <strong>서류 첨부가 빠진 사람이 {missingAttachments.length}명 있습니다.</strong>{" "}
              ZIP 을 받기 전에 확인하세요.
              <span className="block mt-1 text-[var(--muted)]">
                {missingAttachments
                  .slice(0, 12)
                  .map((m) => `${m.name}(${m.lack.join("·")})`)
                  .join(", ")}
                {missingAttachments.length > 12 && ` 외 ${missingAttachments.length - 12}명`}
              </span>
              <span className="block mt-1 text-[var(--muted)]">
                본인은 <strong>노무비 청구 화면</strong>에서 올릴 수 있고, 관리자 대리업로드는
                감사 로그에 남습니다.
              </span>
            </div>
          )}
          {rows.length > 0 && missingAttachments.length === 0 && (
            <p className="mt-4 text-xs text-[var(--muted)]">
              ✓ 모든 청구자가 신분증·통장사본을 제출했습니다.
            </p>
          )}

          <p className="text-xs text-[var(--gray-500)] mt-4">
            근무내역과 개인정보(학생이 입력한 정산정보)는 자동으로 채워집니다. “편집”에서 서류 내용을 직접 수정·확정할 수 있습니다.
            “정산정보 미입력”은 학생이 아직 주민번호·주소·계좌를 입력하지 않은 경우이며, 편집에서 직접 입력할 수 있습니다.
            ZIP 내보내기는 사람마다 폴더를 만들어 <code>학번_이름/청구확인서.pdf</code>와
            함께 <strong>신분증·통장사본</strong>을 담습니다.
          </p>
        </section>
      </main>
    </div>
  );
}
