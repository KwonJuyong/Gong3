import ClearQueryParams from "@/app/components/ClearQueryParams";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import Link from "next/link";
import { prisma } from "../../db";
import { getSettlementProfile } from "../../lib/settlementProfile";
import { getDirectorSignUrl } from "./actions";
import DirectorSignForm from "./DirectorSignForm";
import ClaimBatchForm from "./ClaimBatchForm";
import AttachmentsPanel, { type AttachmentView } from "./AttachmentsPanel";

export const metadata = { title: "노무비 청구" };

function fmtDate(d: Date) {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ signSaved?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();

  const isAdmin = me.role === "ADMIN";
  const { signSaved } = await searchParams;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["signSaved"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">노무비 청구</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {isAdmin
              ? "회차별로 평가자 노무비 청구 확인서를 자동 생성·관리합니다."
              : "노무비 청구 확인서 작성에 필요한 정산 정보를 입력합니다."}
          </p>
        </div>

        {!isAdmin && <PayrollProfileSection userId={userId} />}

        {/* 신분증·통장사본(노무비 서류에만 필요) */}
        {!isAdmin && <MyAttachmentsSection userId={userId} />}

        {isAdmin && <AdminBatchSection userId={userId} fmtDate={fmtDate} signSaved={signSaved === "1"} />}
      </main>
    </div>
  );
}

/** 정산 정보 요약. 편집은 /dashboard/profile?tab=settlement 에서 함 */
async function PayrollProfileSection({ userId }: { userId: string }) {
  const p = await getSettlementProfile(userId);
  const missing: string[] = [];
  if (!p.payoutReady) missing.push("계좌");
  if (!p.hasRrn) missing.push("주민등록번호");
  if (!p.signatureUrl) missing.push("전자서명");

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">내 정산 정보</h3>
          <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
            노무비 청구 확인서 작성에 사용됩니다. 평가 보상 정산과 <strong>같은 정보</strong>라
            프로필에서 한 번만 입력하면 됩니다.
          </p>
        </div>
        <Link
          href="/dashboard/profile?tab=settlement"
          className="shrink-0 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]"
        >
          프로필에서 관리 →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <StatusChip label="계좌" done={p.payoutReady} value={p.payoutReady ? p.bankName : "미등록"} />
        <StatusChip label="주민등록번호" done={p.hasRrn} value={p.hasRrn ? p.rrnMasked : "미등록"} />
        <StatusChip label="전자서명" done={!!p.signatureUrl} value={p.signatureUrl ? "등록됨" : "미등록"} />
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-[var(--warning)] mt-3">
          {missing.join(" · ")}이(가) 없으면 청구 확인서를 완성할 수 없습니다.
        </p>
      )}
    </section>
  );
}

/** 내 서류 첨부. 메타데이터만 내려보내고 storedName 은 클라이언트에 보내지 않음 */
async function MyAttachmentsSection({ userId }: { userId: string }) {
  const rows = await prisma.attachment.findMany({
    where: { ownerId: userId },
    select: { id: true, kind: true, origName: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AttachmentsPanel
      initial={rows.map((a) => ({
        id: a.id,
        kind: a.kind as AttachmentView["kind"],
        origName: a.origName,
        mime: a.mime,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}

function StatusChip({ label, done, value }: { label: string; done: boolean; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={`text-sm font-medium mt-0.5 truncate ${
          done ? "text-[var(--foreground)]" : "text-[var(--gray-500)]"
        }`}
      >
        {done ? "✓ " : ""}
        {value}
      </p>
    </div>
  );
}

function toKSTDateStr(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function AdminBatchSection({
  userId,
  fmtDate,
  signSaved,
}: {
  userId: string;
  fmtDate: (d: Date) => string;
  signSaved: boolean;
}) {
  void userId;
  const [batches, directorSignUrl, finishedProjects] = await Promise.all([
    prisma.claimBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { claims: true } } },
    }),
    getDirectorSignUrl(),
    // 노무비는 연구비 건만 대상임. 업체·학교 건은 플랫폼이 보상으로 지급하므로 섞으면 이중 지급이 됨
    prisma.project.findMany({
      where: { status: "FINISHED", fundingType: "RESEARCH_FUND" },
      select: { id: true, title: true, startTime: true, endTime: true },
      orderBy: { startTime: "desc" },
    }),
  ]);

  const batchProjects = finishedProjects.map((p) => ({
    id: p.id,
    title: p.title,
    startDate: toKSTDateStr(p.startTime),
    endDate: toKSTDateStr(p.endTime ?? p.startTime),
  }));

  return (
    <>
      <DirectorSignForm initialUrl={directorSignUrl} saved={signSaved} />

      <ClaimBatchForm projects={batchProjects} />

      <section className="space-y-3">
        {batches.length === 0 && (
          <p className="text-sm text-[var(--gray-500)] text-center py-10">등록된 청구 회차가 없습니다.</p>
        )}
        {batches.map((b) => (
          <div
            key={b.id}
            className="bg-white rounded-[var(--radius-xl)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[var(--foreground)]">{b.title}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    b.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {b.status === "OPEN" ? "진행 중" : "마감"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                근무기간 {fmtDate(b.periodStart)} ~ {fmtDate(b.periodEnd)}
                {b.defaultRate > 0 && ` · 기본단가 ${b.defaultRate.toLocaleString("ko-KR")}원`}
                {` · 서류 ${b._count.claims}건`}
              </p>
            </div>
            <Link
              href={`/dashboard/payroll/admin/${b.id}`}
              className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)] text-center"
            >
              관리
            </Link>
          </div>
        ))}
      </section>
    </>
  );
}
