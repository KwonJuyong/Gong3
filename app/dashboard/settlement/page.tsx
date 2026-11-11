import { logPersonalData } from "@/app/lib/accessLog";
import ClearQueryParams from "@/app/components/ClearQueryParams";
import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { prisma } from "../../db";
import { won } from "../../lib/money";
import * as ledger from "../../lib/ledger";
import { INCOME_TYPE_LABEL } from "../../lib/withholding";
import { getIncomeType } from "../../lib/rewards";
import { responseQualityFlags, type ProjectQuestion } from "../../lib/projectQuestions";
import { listProfileStatus } from "../../lib/settlementProfile";
import { monthlyWithholding, kstParts } from "../../lib/taxReminder";
import { monthFilingStatus } from "../../lib/taxFiling";
import ProfilesPanel, { type ProfileRow } from "./ProfilesPanel";
import TaxGuidePanel from "./TaxGuidePanel";
import SimpleStatementPanel from "./SimpleStatementPanel";
import FilingPanel from "./FilingPanel";
import LedgerPanel, { type LedgerRowView } from "./LedgerPanel";
import {
  setIncomeTypeAction,
  reviewRewardAction,
  adjustRewardAction,
  generatePayoutsAction,
  confirmPayoutAction,
  confirmPayoutsAction,
  failPayoutAction,
  retryPayoutAction,
  settleOrderAction,
  confirmOrderRefundSentAction,
  recordRemittanceAction,
} from "./actions";

export const metadata = { title: "보상 정산" };

const REWARD_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "검수 대기", cls: "bg-[var(--warning-light)] text-[var(--warning)]" },
  APPROVED: { text: "승인", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  REJECTED: { text: "반려", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  PAID: { text: "지급 완료", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  FAILED: { text: "실패", cls: "bg-[var(--danger-light)] text-[var(--danger)]" },
};

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    missing?: string;
    paid?: string;
    failed?: string;
    retried?: string;
    settled?: string;
    refund?: string;
    refundSent?: string;
    remitted?: string;
    error?: string;
    tab?: string;
  }>;
}) {
  const q = await searchParams;
  // 탭: 처리할 일(검수·지급) / 신고 / 원장
  const tab: "work" | "filing" | "ledger" = q.tab === "filing" || q.tab === "ledger" ? q.tab : "work";
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");
  // 접속기록: 「처리할 일」 탭은 평가단의 계좌를 가리지 않고 보여줌
  if (tab === "work") await logPersonalData(me.id, "VIEW", "보상 정산: 계좌 목록");

  // 신고는 지난달 지급분 기준임
  const today = kstParts(new Date());
  const filingMonth =
    today.month === 1
      ? { year: today.year - 1, month: 12 }
      : { year: today.year, month: today.month - 1 };

  const [incomeType, summary, liability, profiles, orders, filing, filingStatus, ledgerRows] =
    await Promise.all([
    getIncomeType(),
    ledger.summary(),
    ledger.unsettledLiability(),
    listProfileStatus(),
    prisma.order.findMany({
      where: { rewards: { some: {} } },
      include: {
        service: true,
        rewards: {
          include: {
            user: {
              select: {
                name: true,
                // 이체할 때 쓰는 화면이라 계좌를 가리지 않음. 예금주도 함께 가져옴
                payrollProfile: {
                  select: { bankName: true, accountNumber: true, holderName: true },
                },
              },
            },
            payout: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    monthlyWithholding(filingMonth.year, filingMonth.month),
    monthFilingStatus(filingMonth.year, filingMonth.month),
    ledger.recentEntries(50),
  ]);

  const workCount = orders.reduce(
    (n, o) =>
      n +
      o.rewards.filter(
        (r) => r.status === "PENDING" || r.payout?.status === "PENDING" || r.payout?.status === "FAILED",
      ).length,
    0,
  );

  // 검수 대기 보상의 불성실 응답 의심 신호. 응답 원문은 검수 대기 건만 읽음
  const pendingResponses = await prisma.reward.findMany({
    where: { status: "PENDING", responseId: { not: null } },
    select: { id: true, response: { select: { answers: true, project: { select: { questions: true } } } } },
  });
  const qualityFlags = new Map<string, string[]>();
  for (const pr of pendingResponses) {
    if (!pr.response) continue;
    const flags = responseQualityFlags(
      (pr.response.project.questions as unknown as ProjectQuestion[]) || [],
      (pr.response.answers ?? {}) as Record<string, unknown>,
    );
    if (flags.length > 0) qualityFlags.set(pr.id, flags);
  }

  const fmt = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Seoul",
        }).format(d)
      : "";

  // Date 객체는 클라이언트로 넘기지 않고 서버에서 문자열로 만듦
  const ledgerView: LedgerRowView[] = ledgerRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: r.amount,
    liability: r.liability,
    memo: r.memo,
    occurredAt: fmt(r.occurredAt),
    orderNo: r.orderNo,
    balance: r.balance,
  }));

  const profileRows: ProfileRow[] = profiles.map((p) => ({
    userId: p.userId,
    name: p.name,
    studentId: p.studentId,
    bankName: p.profile.bankName,
    accountNumber: p.profile.accountNumber,
    holderName: p.profile.holderName,
    address: p.profile.address,
    hasRrn: p.profile.hasRrn,
    rrnMasked: p.profile.rrnMasked,
    payoutReady: p.profile.payoutReady,
    withholdingReady: p.profile.withholdingReady,
    byAdmin: p.profile.byAdmin,
    consented: p.profile.consentAt != null,
    pendingRewards: p.pendingRewards,
    hasRewards: p.hasRewards,
    updatedAt: fmt(p.profile.updatedAt),
    consentedAt: fmt(p.profile.consentAt),
  }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["created", "missing", "paid", "failed", "retried", "settled", "refund", "refundSent", "remitted", "error"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">보상 정산</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            평가자 응답을 검수하고, 승인분에 원천징수를 적용해 지급합니다.
          </p>
        </div>
        {q.error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
            {q.error}
          </p>
        )}
        {q.created != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            지급 {q.created}건 생성
            {Number(q.missing) > 0 && ` · ${q.missing}명은 계좌정보가 없어 제외됨(학생이 정산정보 입력 필요)`}
          </p>
        )}
        {q.paid != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            {q.paid}건 지급 완료 처리 (원장 기록됨)
          </p>
        )}
        {q.failed != null && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
            이체 실패로 기록했습니다. <strong>원장에는 지급으로 남지 않습니다</strong> — 계좌를
            고친 뒤 &quot;재이체&quot;를 누르세요.
          </p>
        )}
        {q.retried != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            최신 계좌 정보로 이체 목록에 다시 올렸습니다.
          </p>
        )}
        {q.settled != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            정산 마감 완료
            {Number(q.refund) > 0 &&
              ` · 미달분 ${won(Number(q.refund))} 환불 확정: 기업 계좌로 이체한 뒤 "환불 송금 완료"를 누르세요(그때 원장에 기록됩니다)`}
          </p>
        )}
        {q.refundSent != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            환불 송금을 기록했습니다 (원장 반영됨).
          </p>
        )}
        {q.remitted != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            세금 납부를 기록했습니다. 미납액에서 차감됩니다.
          </p>
        )}

        {/* 원장(LedgerEntry) 기준 요약 */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "총 수납", value: summary.paymentIn, sub: "기업 결제 (부가세 포함)" },
            { label: "실지급", value: summary.paidOut, sub: "평가자 (세후)" },
            { label: "환불", value: summary.refunded, sub: "송금 완료분" },
            { label: "통장 잔액", value: summary.cash, sub: "수납−지급−환불" },
            { label: "미납 원천세", value: summary.taxPayable, sub: "받아둔 세금", warn: summary.taxPayable > 0 },
            { label: "미납 부가세", value: summary.vatPayable, sub: "받아둔 세금", warn: summary.vatPayable > 0 },
            // 통장 잔액에서 납부할 세금을 뺀 금액
            { label: "쓸 수 있는 돈", value: summary.available, sub: "잔액−미납세금", strong: true, warn: summary.available < 0 },
            { label: "미지급 부채", value: liability, sub: "학생에게 줄 돈", warn: liability > summary.available },
          ].map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-[var(--radius-xl)] p-4"
            >
              <p className="text-xs text-[var(--muted)]">{c.label}</p>
              <p
                className={`text-lg font-bold mt-1 ${
                  c.warn ? "text-[var(--danger)]" : "text-[var(--foreground)]"
                }`}
              >
                {won(c.value)}
              </p>
              <p className="text-xs text-[var(--gray-500)] mt-0.5">{c.sub}</p>
            </div>
          ))}
        </section>

        {/* 탭(링크로 전환) */}
        <nav aria-label="정산 화면 구역" className="flex gap-1 border-b border-[var(--gray-200)] overflow-x-auto">
          {(
            [
              { id: "work", label: "처리할 일", count: workCount },
              { id: "filing", label: "세무 신고", count: 0 },
              { id: "ledger", label: "원장", count: 0 },
            ] as const
          ).map((t) => (
            <Link
              key={t.id}
              href={t.id === "work" ? "/dashboard/settlement" : `/dashboard/settlement?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-[var(--accent)] text-[var(--foreground)] font-semibold"
                  : "border-transparent text-[var(--gray-700)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="ml-1.5 inline-block min-w-5 px-1.5 rounded-full bg-[var(--danger)] text-white text-xs font-semibold text-center">
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {tab === "work" && (
          <>
        {/* 정산 정보 현황(계좌 미입력자는 지급 생성에서 빠지므로 먼저 보여줌) */}
        <ProfilesPanel rows={profileRows} />

        {orders.length === 0 && (
          <p className="text-sm text-[var(--gray-500)] text-center py-12 bg-white rounded-[var(--radius-xl)]">
            아직 보상이 없습니다. 유료 의뢰 평가에 학생이 응답하면 여기에 나타납니다.
          </p>
        )}

        {orders.map((order) => {
          const rewards = order.rewards;
          const pending = rewards.filter((r) => r.status === "PENDING").length;
          const approved = rewards.filter((r) => r.status === "APPROVED");
          const approvedNoPayout = approved.filter((r) => !r.payout).length;
          const payable = approved.filter((r) => r.payout && r.payout.status === "PENDING").length;
          const failedPayouts = rewards.filter((r) => r.payout?.status === "FAILED").length;
          const grossSum = rewards.reduce((s, r) => s + r.grossAmount, 0);
          // 이행분: 승인된 것 전부(FAILED 포함). settleOrderRefund 와 같은 기준임
          const fulfilled = rewards.filter(
            (r) => r.status === "APPROVED" || r.status === "PAID" || r.status === "FAILED",
          );
          const netSum = fulfilled.reduce((s, r) => s + r.netAmount, 0);
          const taxSum = fulfilled.reduce((s, r) => s + r.taxAmount, 0);
          // 청구액(발주 보상 소계)과 지급 예정액의 차이. 개인별 조정이나 미달이 있으면 생김
          // 정원이 아직 안 찬 경우에도 음수가 나므로 문구로 구분함
          const subtotalGap = grossSum - order.subtotal;
          const adjustedCount = rewards.filter((r) => r.adjustedAt).length;
          const allResponded = rewards.length >= order.panelSize;

          return (
            <section
              key={order.id}
              className="bg-white rounded-[var(--radius-xl)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[var(--gray-100)]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                      {order.service.name} · {order.orderNo}
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      응답 {rewards.length}명 · 검수대기 {pending} · 승인 {approved.length}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[var(--muted)]">
                    <div>세전 {won(grossSum)}</div>
                    <div>
                      원천징수 {won(taxSum)} · 실지급 {won(netSum)}
                    </div>
                    <div className="text-xs text-[var(--gray-500)] mt-0.5">
                      의뢰 보상 소계 {won(order.subtotal)}
                      {adjustedCount > 0 && ` · 조정 ${adjustedCount}건`}
                    </div>
                  </div>
                </div>

                {subtotalGap !== 0 && (
                  <p
                    className={`mt-2 text-xs leading-relaxed px-3 py-2 rounded-[var(--radius-md)] ${
                      subtotalGap > 0
                        ? "text-[var(--warning)] bg-[var(--warning-light)]"
                        : "text-[var(--muted)] bg-[var(--gray-50)]"
                    }`}
                  >
                    {subtotalGap > 0 ? (
                      <>
                        <strong>지급 예정액이 의뢰 보상 소계보다 {won(subtotalGap)} 많습니다.</strong>{" "}
                        기업에 청구한 금액보다 학생에게 나갈 돈이 큽니다. 견적서에서 빠진
                        평가자가 없는지, 개인 조정이 과했는지 확인하세요.
                      </>
                    ) : allResponded ? (
                      <>
                        지급 예정액이 의뢰 보상 소계보다 {won(-subtotalGap)} 적습니다. 정원이 다
                        찼는데도 남으면 <strong>정산 마감에서 미달분이 환불</strong>됩니다.
                      </>
                    ) : (
                      <>
                        아직 정원({order.panelSize}명)이 안 찼습니다. 응답 {rewards.length}명.
                        남은 {won(-subtotalGap)} 은 미응답분입니다.
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                      <th className="px-4 py-2 font-semibold">학생</th>
                      <th className="px-4 py-2 font-semibold">세전</th>
                      <th className="px-4 py-2 font-semibold">원천징수</th>
                      <th className="px-4 py-2 font-semibold">실지급</th>
                      <th className="px-4 py-2 font-semibold">이체 정보</th>
                      <th className="px-4 py-2 font-semibold">상태</th>
                      <th className="px-4 py-2 font-semibold">조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewards.map((r) => {
                      const label = REWARD_LABEL[r.status] ?? REWARD_LABEL.PENDING;
                      const po = r.payout;
                      const prof = r.user.payrollProfile;
                      // Payout 이 있으면 그 계좌, 없으면 현재 프로필 계좌를 보여줌
                      const bank = po?.bankName || prof?.bankName || "";
                      const acct = po?.accountNumber || prof?.accountNumber || "";
                      const holder = po?.holderName || prof?.holderName || r.user.name;
                      // 예금주가 본인 이름과 다르면 표시함
                      const holderDiffers = holder !== r.user.name;
                      return (
                        <tr key={r.id} className="border-t border-[var(--gray-100)]">
                          <td className="px-4 py-2 text-[var(--foreground)]">
                            {r.user.name}
                            {qualityFlags.get(r.id)?.map((f) => (
                              <div key={f} className="text-xs text-[var(--warning)] font-medium">
                                {f}
                              </div>
                            ))}
                          </td>
                          <td className="px-4 py-2 text-[var(--muted)]">
                            {won(r.grossAmount)}
                            {r.adjustedAt && (
                              <span
                                className="ml-1 text-xs px-1 py-0.5 rounded bg-[var(--gray-100)] text-[var(--muted)]"
                                title={r.adjustReason ?? "개인별 금액 조정됨"}
                              >
                                조정
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[var(--muted)]">
                            {r.taxExempt ? "비과세" : won(r.taxAmount)}
                          </td>
                          <td className="px-4 py-2 font-medium text-[var(--foreground)]">
                            {won(r.netAmount)}
                          </td>
                          <td className="px-4 py-2">
                            {!bank || !acct ? (
                              <span className="text-[var(--danger)]">계좌 미등록</span>
                            ) : (
                              <div className="leading-tight">
                                <div className="font-mono text-xs text-[var(--foreground)] whitespace-nowrap">
                                  {bank} {acct}
                                </div>
                                <div
                                  className={`text-xs ${
                                    holderDiffers ? "text-[var(--warning)] font-medium" : "text-[var(--gray-500)]"
                                  }`}
                                >
                                  예금주 {holder}
                                  {holderDiffers && " (본인과 다름)"}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${label.cls}`}>
                              {label.text}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            {r.status === "PENDING" ? (
                              <div className="flex gap-1">
                                <form action={reviewRewardAction}>
                                  <input type="hidden" name="rewardId" value={r.id} />
                                  <input type="hidden" name="approve" value="1" />
                                  <ConfirmButton
                                    message={`${r.user.name}님의 보상 ${won(r.grossAmount)}(실지급 ${won(r.netAmount)})을 승인합니다.\n\n· 승인하면 금액을 더 조정할 수 없습니다.\n\n정말 승인하시겠습니까?`}
                                    className="px-2 py-1 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-sm)] hover:bg-[var(--accent-dark)]"
                                  >
                                    승인
                                  </ConfirmButton>
                                </form>
                                <form action={reviewRewardAction}>
                                  <input type="hidden" name="rewardId" value={r.id} />
                                  <input type="hidden" name="approve" value="0" />
                                  <ConfirmButton
                                    message={`${r.user.name}님의 보상 ${won(r.grossAmount)}을 반려합니다.\n\n· 이 학생은 이 응답에 대한 보상을 받지 못합니다.\n· 화면에서 되돌릴 수 없습니다.\n\n정말 반려하시겠습니까?`}
                                    className="px-2 py-1 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-sm)] hover:bg-[var(--gray-50)]"
                                  >
                                    반려
                                  </ConfirmButton>
                                </form>
                                {/* 개인별 금액 조정(승인 전에만). 세금도 다시 계산됨 */}
                                <form action={adjustRewardAction} className="flex gap-1">
                                  <input type="hidden" name="rewardId" value={r.id} />
                                  <input
                                    name="grossAmount"
                                    type="number"
                                    min={0}
                                    max={1000000}
                                    defaultValue={r.grossAmount}
                                    aria-label={`${r.user.name} 보상액`}
                                    className="w-20 px-1.5 py-1 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)]"
                                  />
                                  <ConfirmButton
                                    message={`${r.user.name}님의 보상액을 ${won(r.grossAmount)} → {grossAmount}원으로 바꿉니다.\n\n· 원천징수 세액이 다시 계산됩니다(과세최저한 판정이 바뀔 수 있습니다).\n· 의뢰 보상 소계와 차이가 생기면 화면에 표시됩니다.\n\n정말 바꾸시겠습니까?`}
                                    title="개인별 보상액 조정 (승인 전에만 가능)"
                                    className="px-2 py-1 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-sm)] hover:bg-[var(--gray-50)] whitespace-nowrap"
                                  >
                                    금액
                                  </ConfirmButton>
                                </form>
                              </div>
                            ) : po?.status === "PENDING" ? (
                              // 이체했으면 [지급 완료], 실패했으면 [실패]. 원장은 [지급 완료]에서만 기록됨
                              <div className="flex gap-1 items-center">
                                <form action={confirmPayoutAction}>
                                  <input type="hidden" name="payoutId" value={po.id} />
                                  <ConfirmButton
                                    message={`${r.user.name}님에게 ${won(r.netAmount)} 이체를 마쳤습니까?\n\n· 원장에 지급으로 기록되고 되돌릴 수 없습니다.\n· 원천징수 명세·지급명세서에 지급분으로 들어갑니다.\n· 이체가 튕겼다면 취소하고 [실패]를 누르세요.\n\n정말 지급 완료로 처리하시겠습니까?`}
                                    className="px-2 py-1 text-xs font-medium bg-[var(--success)] text-white rounded-[var(--radius-sm)] hover:opacity-90 whitespace-nowrap"
                                  >
                                    지급 완료
                                  </ConfirmButton>
                                </form>
                                <form action={failPayoutAction} className="flex gap-1 items-center">
                                  <input type="hidden" name="payoutId" value={po.id} />
                                  <input
                                    name="reason"
                                    placeholder="실패 사유"
                                    className="w-20 px-1.5 py-1 text-xs border border-[var(--gray-200)] rounded-[var(--radius-sm)]"
                                  />
                                  <ConfirmButton
                                    message={`${r.user.name}님 이체를 실패로 기록합니다(사유: {reason}).\n\n· 원장에는 기록되지 않습니다.\n· 계좌를 고친 뒤 [재이체]로 다시 올려야 합니다.\n\n정말 실패로 기록하시겠습니까?`}
                                    className="px-2 py-1 text-xs font-medium border border-[var(--danger)] text-[var(--danger)] rounded-[var(--radius-sm)] hover:bg-[var(--danger-light)]"
                                  >
                                    실패
                                  </ConfirmButton>
                                </form>
                              </div>
                            ) : po?.status === "FAILED" ? (
                              <div className="flex gap-1 items-center">
                                <span className="text-xs text-[var(--danger)] max-w-[120px] truncate">
                                  {po.failReason || "이체 실패"}
                                </span>
                                <form action={retryPayoutAction}>
                                  <input type="hidden" name="payoutId" value={po.id} />
                                  <ConfirmButton
                                    message={`${r.user.name}님 지급을 다시 이체 대기로 올립니다.\n\n· 계좌 정보를 고쳤는지 먼저 확인하세요. 같은 계좌면 또 튕깁니다.\n\n정말 재이체 대기로 올리시겠습니까?`}
                                    className="px-2 py-1 text-xs font-medium border border-[var(--gray-900)] rounded-[var(--radius-sm)] hover:bg-[var(--gray-50)] whitespace-nowrap"
                                  >
                                    재이체
                                  </ConfirmButton>
                                </form>
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--gray-500)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 border-t border-[var(--gray-100)] flex items-center gap-2 flex-wrap">
                {approvedNoPayout > 0 && (
                  <form action={generatePayoutsAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <ConfirmButton
                      message={`승인된 보상 ${approvedNoPayout}건의 지급(이체 대기) 건을 만듭니다.\n\n· 지금 등록된 계좌·예금주가 이체 대상으로 고정됩니다.\n· 계좌 미등록자는 빠집니다. 위 「평가자 정산 정보」에서 먼저 확인하세요.\n\n정말 지급을 생성하시겠습니까?`}
                      className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]"
                    >
                      지급 생성 ({approvedNoPayout}건)
                    </ConfirmButton>
                  </form>
                )}
                <a
                  href={`/api/settlement/payout/${order.id}`}
                  title="이체할 계좌 목록. 대량이체를 쓸 수 있으면 업로드용으로, 아니면 대조용으로 쓴다."
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                >
                  이체 목록 (CSV)
                </a>
                <a
                  href={`/api/settlement/withholding/${order.id}`}
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                >
                  원천징수 명세 (주민번호)
                </a>
                {payable > 0 && (
                  // 모든 이체가 성공했을 때만 쓰는 편의 버튼. 실패한 건은 먼저 [실패]로 처리함
                  <form action={confirmPayoutsAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <ConfirmButton
                      message={`이체 대기 ${payable}건을 전부 지급 완료로 처리합니다.\n\n· ${payable}건 모두 이체가 성공했을 때만 누르세요. 한 건이라도 튕겼다면 취소하고 그 줄의 [실패]를 먼저 누르세요.\n· 원장에 지급으로 기록되고 되돌릴 수 없습니다.\n\n정말 전체 지급 완료로 처리하시겠습니까?`}
                      title="전액 이체가 성공했을 때만 누르세요. 일부만 보냈다면 각 줄에서 건별로 확인하세요."
                      className="px-3 py-1.5 text-xs font-medium border border-[var(--success)] text-[var(--success)] rounded-[var(--radius-md)] hover:bg-[var(--success-light)]"
                    >
                      전체 지급 완료 ({payable}건)
                    </ConfirmButton>
                  </form>
                )}
                {failedPayouts > 0 && (
                  <span className="text-xs text-[var(--danger)]">
                    이체 실패 {failedPayouts}건: 계좌 확인 후 재이체 필요
                  </span>
                )}
                {order.status !== "SETTLED" && pending === 0 && (
                  <form action={settleOrderAction} className="ml-auto">
                    <input type="hidden" name="orderId" value={order.id} />
                    <ConfirmButton
                      message={
                        `${order.orderNo} 정산을 마감합니다.\n\n` +
                        (order.panelSize > fulfilled.length
                          ? `· 정원 ${order.panelSize}명 중 ${fulfilled.length}명만 이행돼 미달분 환불액이 확정됩니다.\n`
                          : "") +
                        "· 마감한 의뢰는 다시 열 수 없습니다.\n\n정말 마감하시겠습니까?"
                      }
                      className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-900)] text-[var(--foreground)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                    >
                      정산 마감{" "}
                      {order.panelSize > fulfilled.length &&
                        `(미달 ${order.panelSize - fulfilled.length}명 환불)`}
                    </ConfirmButton>
                  </form>
                )}
                {order.status === "SETTLED" &&
                  (order.refundAmount && order.refundAmount > 0 && !order.refundSentAt ? (
                    // 환불액은 마감 때 확정되고, 송금 후 이 버튼으로 원장에 기록함
                    <form action={confirmOrderRefundSentAction} className="ml-auto flex items-center gap-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <span className="text-xs text-[var(--warning)]">
                        환불 {won(order.refundAmount)} 미송금
                      </span>
                      <ConfirmButton
                        message={`기업 계좌로 환불 ${won(order.refundAmount)}을 송금했습니까?\n\n· 원장에 환불 출금으로 기록되고 되돌릴 수 없습니다.\n· 실제로 송금한 뒤에만 누르세요.\n\n정말 송금 완료로 처리하시겠습니까?`}
                        className="px-3 py-1.5 text-xs font-medium border border-[var(--warning)] text-[var(--warning)] rounded-[var(--radius-md)] hover:bg-[var(--warning-light)]"
                      >
                        환불 송금 완료
                      </ConfirmButton>
                    </form>
                  ) : (
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      정산 마감됨
                      {order.refundSentAt ? ` · 환불 ${won(order.refundAmount ?? 0)} 송금됨` : ""}
                    </span>
                  ))}
              </div>
            </section>
          );
        })}
          </>
        )}

        {tab === "filing" && (
          <>
        {/* 신고용 숫자(홈택스·위택스에 옮겨 적는 값) */}
        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              신고용 숫자: {filingMonth.year}년 {filingMonth.month}월 지급분
            </h3>
            <span className="text-xs text-[var(--muted)]">
              원천세·지방소득세 <strong>다음 달 10일</strong> · 간이지급명세서{" "}
              <strong>다음 달 말일</strong>
            </span>
          </div>

          {filing.payoutCount === 0 ? (
            <p className="text-xs text-[var(--muted)] mt-2">
              그 달에 실제로 지급된 보상이 없습니다. 지급이 없었으면 신고할 소득도 없습니다.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
                {[
                  { label: "인원", value: `${filing.personCount}명`, sub: `${filing.payoutCount}건` },
                  { label: "지급액(세전)", value: won(filing.gross), sub: "총 지급액" },
                  { label: "소득세", value: won(filing.incomeTax), sub: "홈택스" },
                  { label: "지방소득세", value: won(filing.localTax), sub: "위택스 별도" },
                  { label: "실지급", value: won(filing.net), sub: "학생 수령액" },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-[var(--radius-md)] border border-[var(--gray-200)] px-3 py-2"
                  >
                    <p className="text-xs text-[var(--muted)]">{c.label}</p>
                    <p className="text-base font-bold mt-0.5 text-[var(--foreground)]">{c.value}</p>
                    <p className="text-xs text-[var(--gray-500)] mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>
              <ol className="text-xs text-[var(--muted)] mt-3 space-y-1 list-decimal list-inside">
                <li>
                  홈택스 → 세금신고 → 원천세 신고 → 일반신고.{" "}
                  <strong>세액 0원인 경우에도 신고 대상.</strong>
                </li>
                <li>
                  접수증의 <strong>&quot;지방소득세 신고이동&quot;</strong> 이용. 위택스로 신고내역이
                  연계된다.
                </li>
                <li>
                  홈택스 → 간이지급명세서 제출.{" "}
                  <strong>세액 0원인 경우에도 제출 대상</strong> (미제출 가산세 0.25%).
                </li>
              </ol>
              {/* 월별 명세(발주별 명세는 발주 화면에서 받음) */}
              <form
                method="get"
                action="/api/settlement/withholding/monthly"
                className="mt-3 flex items-center gap-2 flex-wrap"
              >
                <select
                  name="year"
                  defaultValue={filingMonth.year}
                  className="px-2 py-1.5 text-xs border border-[var(--gray-200)] rounded-[var(--radius-md)]"
                >
                  {[filingMonth.year, filingMonth.year - 1].map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <select
                  name="month"
                  defaultValue={filingMonth.month}
                  className="px-2 py-1.5 text-xs border border-[var(--gray-200)] rounded-[var(--radius-md)]"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
                <SubmitButton className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]">
                  월별 원천징수 명세 받기
                </SubmitButton>
                <span className="text-xs text-[var(--gray-500)]">
                  주민번호 포함 · 지급일 기준 · 합계行 포함
                </span>
              </form>
              <p className="text-xs text-[var(--gray-500)] mt-1.5">
                ※ 위 CSV 는 <strong>홈택스 서식 기재용</strong>(지급 1건당 1행)입니다. 간이지급
                명세서는 <strong>소득자 1명당 1행</strong>이라 구조가 달라 아래에서 따로 받습니다.
              </p>

              {/* 간이지급명세서(.xlsx). CSV 는 Payout 1행, 이 양식은 소득자 1행 + 지급건수임 */}
              <SimpleStatementPanel
                defaultYear={filingMonth.year}
                defaultMonth={filingMonth.month}
              />
            </>
          )}
        </section>

        {/* 세무 신고 기록(리마인더도 이 기록을 봄) */}
        <FilingPanel
          year={filingStatus.year}
          month={filingStatus.month}
          current={filingStatus.current}
          rows={filingStatus.rows.map((r) => ({
            kind: r.kind,
            label: r.label,
            where: r.where,
            due: r.due.toISOString(),
            overdue: r.overdue,
            drift: r.drift,
            filed: r.filed
              ? {
                  ...r.filed,
                  filedAt: r.filed.filedAt.toISOString(),
                  amendedAt: r.filed.amendedAt ? r.filed.amendedAt.toISOString() : null,
                }
              : null,
          }))}
        />

        <TaxGuidePanel />

        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">세금 기록</h3>
          <ul className="text-xs text-[var(--muted)] mt-1 space-y-0.5">
            <li>
              · <strong>원천세·부가세 납부</strong>: 실제 납부 후 기록한다. 통장 잔액과 미납액이
              함께 차감된다.
            </li>
            <li>
              · <strong>매입세액</strong>: 운영비 세금계산서를 수취한 후 그 세액을 기록한다.
              현금은 움직이지 않고 납부할 부가세만 차감된다.
            </li>
            <li>※ 신고·납부 자체는 홈택스·위택스에서 수행한다.</li>
          </ul>
          <form action={recordRemittanceAction} className="mt-3 flex gap-2 items-center flex-wrap">
            <select
              name="kind"
              className="px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
            >
              <option value="TAX">원천세 납부</option>
              <option value="VAT">부가세 납부</option>
              <option value="VAT_INPUT">매입세액 (운영비)</option>
            </select>
            <input
              name="amount"
              inputMode="numeric"
              placeholder="납부액(원)"
              className="w-32 px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
              required
            />
            <input
              name="memo"
              placeholder="메모 (예: 2026-07월분)"
              className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
            />
            <ConfirmButton
              message={"{kind} {amount}원을 원장에 기록합니다.\n\n· 원장은 추가만 되고 지울 수 없습니다(틀리면 반대 기록으로 바로잡아야 합니다).\n· 실제로 납부·수취한 뒤에만 기록하세요.\n\n정말 기록하시겠습니까?"}
              className="px-3 py-2 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]"
            >
              기록
            </ConfirmButton>
          </form>
        </section>

        {/* 소득 구분(판정 기준과 함께 표시) */}
        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">원천징수 소득 구분</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            일시적 인적용역은 <strong>기타소득</strong>(8.8%, 지급액 125,000원 이하 비과세),
            계속·반복적 용역은 <strong>사업소득</strong>(3.3%, 지급액 33,333원 이하 비과세)으로
            구분한다. 동일인이 여러 회차에 반복 참여하는 경우 사업소득에 해당할 수 있다.
          </p>
          <ul className="text-xs text-[var(--muted)] mt-1.5 space-y-0.5">
            <li>
              ※ 지급액 33,333원 이하는 <strong>소득구분과 무관하게 원천징수세액 0원</strong>이다.
              단가가 그 이하인 경우 구분 확정을 지급의 선행조건으로 보지 않는다.
            </li>
            <li>
              ※ 세액 0원인 경우에도 <strong>간이지급명세서는 매월 제출</strong>한다. 일시적
              인적용역(소득세법 제21조 제1항 제19호)은 과세최저한 제출 면제의 예외이며, 미제출
              가산세는 지급액의 0.25%이다.
            </li>
            <li>※ 판단이 곤란한 경우 국세청 상담센터(126)에 사실관계를 정리하여 문의한다.</li>
          </ul>
          <form action={setIncomeTypeAction} className="mt-3 flex gap-2 items-center">
            <select
              name="incomeType"
              defaultValue={incomeType}
              className="px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
            >
              <option value="OTHER">{INCOME_TYPE_LABEL.OTHER}</option>
              <option value="BUSINESS">{INCOME_TYPE_LABEL.BUSINESS}</option>
            </select>
            <ConfirmButton
              message={"소득 구분을 「{incomeType}」(으)로 저장합니다.\n\n· 앞으로 생기는 보상의 원천징수 세율이 바뀝니다.\n· 이미 생긴 보상의 세금은 바뀌지 않습니다.\n\n정말 저장하시겠습니까?"}
              className="px-3 py-2 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]"
            >
              저장
            </ConfirmButton>
            <span className="text-xs text-[var(--muted)]">
              변경해도 기존 보상의 세금은 바뀌지 않습니다(생성 시점 스냅샷).
            </span>
          </form>
        </section>
          </>
        )}

        {/* 원장 내역(통장 대사용) */}
        {tab === "ledger" && <LedgerPanel rows={ledgerView} />}
      </main>
    </div>
  );
}
