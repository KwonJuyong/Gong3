import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import ReauthField from "@/app/components/ReauthField";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../db";
import { won } from "../../../lib/money";
import { NTS_STATE, ntsStateLabel } from "../../../lib/popbill";
import { needsTaxInvoiceAmendment } from "../../../lib/payments";
import { getPlatformAccount } from "../../../lib/orgSettings";
import {
  confirmDepositAction,
  cancelPaymentAction,
  confirmPaymentRefundSentAction,
  markTaxInvoiceAmendedAction,
  retryInvoiceAction,
} from "../actions";

export const metadata = { title: "평가 의뢰 상세" };

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "작성 중", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  PENDING: { text: "입금 대기", cls: "bg-[var(--warning-light)] text-[var(--warning)]" },
  PAID: { text: "입금 완료", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  IN_PROGRESS: { text: "평가 진행 중", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  SETTLED: { text: "정산 완료", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  CANCELLED: { text: "취소됨", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  REFUNDED: { text: "환불됨", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
};

function seoul(d: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(d);
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orderId } = await params;
  const q = await searchParams;

  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();

  const [order, account] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        service: true,
        payments: { orderBy: { createdAt: "desc" } },
        rewards: true,
        // 발주자의 현재 사업자 확인 상태(Order.biz* 는 발주 시점 값)
        buyer: {
          select: {
            bizProfile: {
              select: {
                bizNo: true,
                bizName: true,
                attestedAt: true,
                bizState: true,
                bizVerifiedAt: true,
              },
            },
          },
        },
      },
    }),
    getPlatformAccount(),
  ]);
  if (!order) redirect("/dashboard/orders");
  if (order.buyerId !== me.id && me.role !== "ADMIN") redirect("/dashboard/orders");

  const admin = me.role === "ADMIN";
  // 취소되지 않은 결제(발주당 1건)
  const payment = order.payments.find((p) => p.status !== "CANCELLED") ?? order.payments[0];
  const awaiting = payment?.status === "PENDING";
  const paid = payment?.status === "PAID";
  const accountSet = account.bank && account.account && account.holder;

  const label = STATUS_LABEL[order.status] ?? STATUS_LABEL.PENDING;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["error"]} />
        <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 의뢰 목록
        </Link>
        <div>
          <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">{order.service.name} 평가</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {order.orderNo} · {seoul(order.createdAt)}
          </p>
        </div>
        {q.error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
            {q.error}
          </p>
        )}

        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">의뢰 내역</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${label.cls}`}>{label.text}</span>
          </div>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">
                참여 보상 ({order.panelSize}명 × {won(order.rewardPerPerson)})
              </dt>
              <dd className="text-[var(--foreground)]">{won(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">플랫폼 수수료 ({order.feeRateBp / 100}%)</dt>
              <dd className="text-[var(--foreground)]">{won(order.fee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">부가세</dt>
              <dd className="text-[var(--foreground)]">{won(order.vat)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--gray-100)] font-semibold">
              <dt className="text-[var(--foreground)]">청구 금액</dt>
              <dd className="text-[var(--foreground)] text-base">{won(order.totalAmount)}</dd>
            </div>
          </dl>
        </section>

        {order.bizName && (
          <section className="bg-white rounded-[var(--radius-xl)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">세금계산서 정보</h3>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">상호 (사업자번호)</dt>
                <dd className="text-[var(--foreground)]">
                  {order.bizName} ({order.bizNo})
                </dd>
              </div>
              {order.bizCeo && (
                <div className="flex justify-between">
                  <dt className="text-[var(--muted)]">대표자</dt>
                  <dd className="text-[var(--foreground)]">{order.bizCeo}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">수신 이메일</dt>
                <dd className="text-[var(--foreground)]">{order.bizEmail}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* 발주자 확인 상태(관리자 전용). 위의 세금계산서 정보는 발주 시점 값이고 이것은 현재 값이라
            따로 보여주고 확인 시각을 함께 표시함. attestedAt 은 기록용이며 권한 판정에 쓰지 않음 */}
        {me.role === "ADMIN" && (
          <section className="bg-white rounded-[var(--radius-xl)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              의뢰자 확인 상태
              <span className="ml-1.5 text-xs font-normal px-1.5 py-0.5 rounded-full bg-[var(--gray-100)] text-[var(--muted)]">
                관리자
              </span>
            </h3>
            <p className="text-xs text-[var(--gray-500)] mt-1 leading-relaxed">
              <strong>지금 값</strong>입니다. 위 「세금계산서 정보」는 발행 시점 스냅샷이라
              서로 다를 수 있습니다. 의뢰일({seoul(order.createdAt)})과 아래 시각을 비교하세요.
            </p>
            {(() => {
              const bp = order.buyer?.bizProfile;
              if (!bp) {
                return (
                  <p className="text-xs text-[var(--muted)] mt-3">
                    등록된 기업 정보가 없습니다. (이 의뢰는 폼에 직접 입력해 만든 건입니다)
                  </p>
                );
              }
              const numberChanged = bp.bizNo !== order.bizNo;
              return (
                <>
                  <dl className="text-sm space-y-1.5 mt-3">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">현재 사업자번호</dt>
                      <dd className="text-[var(--foreground)] text-right">
                        {bp.bizName || "-"} ({bp.bizNo || "-"})
                        {numberChanged && (
                          <span className="block text-xs text-[var(--warning)]">
                            의뢰 시점({order.bizNo})과 다릅니다
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">실재 확인 (팝빌)</dt>
                      <dd className="text-right text-[var(--foreground)]">
                        {bp.bizState ?? "확인 못 함"}
                        {bp.bizVerifiedAt && (
                          <span className="block text-xs text-[var(--gray-500)]">
                            {seoul(bp.bizVerifiedAt)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--muted)]">의뢰 권한 확인</dt>
                      <dd className="text-right text-[var(--foreground)]">
                        {bp.attestedAt ? "확인함" : "기록 없음"}
                        {bp.attestedAt && (
                          <span className="block text-xs text-[var(--gray-500)]">
                            {seoul(bp.attestedAt)}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {!bp.attestedAt && (
                    <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
                      확인 기록이 없는 건 <strong>이 컬럼이 생기기 전에 등록한 기업</strong>일
                      수 있습니다(소급 입력하지 않았습니다). 의뢰를 막는 조건은 아닙니다.
                    </p>
                  )}
                </>
              );
            })()}
          </section>
        )}

        {/* 입금 안내(기업용) */}
        {awaiting && (
          <section className="bg-white rounded-[var(--radius-xl)] border-2 border-[var(--warning)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">입금 안내</h3>
            {accountSet ? (
              <>
                <p className="text-xs text-[var(--muted)] mt-1">
                  아래 계좌로 <strong>{won(order.totalAmount)}</strong> 를 입금해 주세요. 입금이
                  확인되면 평가자 모집이 시작됩니다. 세금계산서는 별도 발행됩니다.
                </p>
                <div className="mt-4 p-4 bg-[var(--gray-50)] rounded-[var(--radius-md)] space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">은행</span>
                    <span className="font-medium text-[var(--foreground)]">{account.bank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">계좌번호</span>
                    <span className="font-mono font-medium text-[var(--foreground)]">
                      {account.account}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">예금주</span>
                    <span className="font-medium text-[var(--foreground)]">{account.holder}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[var(--gray-200)]">
                    <span className="text-[var(--muted)]">입금액</span>
                    <span className="font-semibold text-[var(--foreground)]">
                      {won(order.totalAmount)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted)] mt-3">
                  입금 시 의뢰 번호 <strong>{order.orderNo}</strong> 를 남겨주시면 확인이 빠릅니다.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--danger)] mt-2">
                입금 계좌가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.
              </p>
            )}
          </section>
        )}

        {paid && (
          <section className="bg-white rounded-[var(--radius-xl)] p-5">
            <h3 className="text-sm font-semibold text-[var(--success)]">입금이 확인되었습니다</h3>
            <p className="text-xs text-[var(--muted)] mt-1">
              {payment?.paidAt && `${seoul(payment.paidAt)} 확인 · `}
              평가자 모집을 시작할 수 있습니다. 평가자 {order.rewards.length}명이 응답했습니다.
            </p>
            {/* 발행(300)과 국세청 전송 결과(304/305)를 구분해 보여줌 */}
            {payment?.taxInvoiceIssued ? (
              payment.taxInvoiceNtsState === NTS_STATE.SEND_FAILED ? (
                <p className="text-xs text-[var(--danger)] mt-2">
                  세금계산서 국세청 전송 실패: 확인이 필요합니다
                  {payment.taxInvoiceNtsNum && ` (승인 ${payment.taxInvoiceNtsNum})`}
                </p>
              ) : (
                <p className="text-xs text-[var(--success)] mt-2">
                  ✓ 세금계산서 발행 완료 ({ntsStateLabel(payment.taxInvoiceNtsState)}
                  {payment.taxInvoiceNtsNum && ` · 승인 ${payment.taxInvoiceNtsNum}`})
                </p>
              )
            ) : (
              <p className="text-xs text-[var(--warning)] mt-2">
                세금계산서 발행 대기{payment?.taxInvoiceError && `: ${payment.taxInvoiceError}`}
              </p>
            )}
          </section>
        )}

        {admin && payment && (
          <section className="bg-white rounded-[var(--radius-xl)] border border-[var(--gray-300)] p-5 space-y-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">관리자</h3>

            {awaiting && (
              <form action={confirmDepositAction} className="space-y-3">
                <input type="hidden" name="paymentId" value={payment.id} />
                <p className="text-xs text-[var(--muted)]">
                  통장에서 <strong>{won(order.totalAmount)}</strong> 입금을 확인한 뒤 처리하세요.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    name="depositorName"
                    placeholder="입금자명 (통장 대사용)"
                    className="px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
                  />
                  <input
                    name="memo"
                    placeholder="메모 (선택)"
                    className="px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
                  />
                  <ReauthField className="sm:col-span-2" />
                </div>
                <ConfirmButton
                  message={`통장에서 ${won(order.totalAmount)} 입금(입금자명: {depositorName})을 확인했습니까?\n\n· 원장에 입금으로 기록되고 되돌릴 수 없습니다.\n· 의뢰가 확정되고, 세금계산서가 아직 없으면 자동 발행됩니다(국세청 신고).\n· 실제로 통장에 들어온 것을 본 뒤에만 누르세요.\n\n정말 입금 확인으로 처리하시겠습니까?`}
                  className="px-4 py-2 text-sm font-semibold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]"
                >
                  입금 확인 → 의뢰 확정
                </ConfirmButton>
              </form>
            )}

            {/* 세금계산서. 발급 시기는 입금이 아니라 공급시기(용역 완료)라 입금 전에도 발행할 수 있음
                나중에 입금을 확인해도 taxInvoiceIssued 로 이중 발행을 막음 */}
            {!payment.taxInvoiceIssued && payment.status !== "CANCELLED" && (
              <form action={retryInvoiceAction} className="space-y-2">
                <input type="hidden" name="paymentId" value={payment.id} />
                <p className="text-xs text-[var(--warning)]">
                  세금계산서가 아직 발행되지 않았습니다.
                  {payment.taxInvoiceError && ` (${payment.taxInvoiceError})`}
                </p>
                {!paid && (
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    발급시기는 <strong>용역이 완료된 때(공급시기)</strong>이지 입금 시점이
                    아닙니다. 평가가 이미 끝났다면 <strong>입금 전이라도 지금 발행</strong>해야
                    하고, 공급시기가 속한 달의 <strong>다음 달 10일</strong>을 넘기면 지연발급
                    가산세가 붙습니다. 발행해도 입금 확인은 별도로 진행됩니다.
                  </p>
                )}
                <ReauthField className="block w-full sm:w-64" />
                <ConfirmButton
                  message={`${order.orderNo} 세금계산서를 발행합니다(${paid ? "영수" : "청구"}).\n\n· 운영 환경에서는 실제 국세청 신고로 이어집니다.\n· 발행 후에는 취소할 수 없고, 틀렸으면 수정세금계산서를 따로 발행해야 합니다.\n· 공급받는자 상호·사업자번호가 맞는지 먼저 확인하세요.\n\n정말 발행하시겠습니까?`}
                  className="px-3 py-2 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                >
                  {paid ? "세금계산서 발행 재시도" : "세금계산서 지금 발행"}
                </ConfirmButton>
              </form>
            )}

            {payment.status !== "CANCELLED" && (
              <form action={cancelPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <input type="hidden" name="reason" value="관리자 취소" />
                <ConfirmButton
                  message={
                    paid
                      ? `${order.orderNo} 수납을 취소하고 환불을 확정합니다.\n\n· 되돌릴 수 없습니다.\n· 기업 계좌로 환불을 송금한 뒤 [환불 송금 완료]를 따로 눌러야 원장에 반영됩니다.\n· 세금계산서가 발행됐다면 수정세금계산서 발행이 필요합니다.\n\n정말 수납을 취소하시겠습니까?`
                      : `${order.orderNo} 의뢰를 취소합니다.\n\n· 되돌릴 수 없습니다.\n\n정말 의뢰를 취소하시겠습니까?`
                  }
                  className="px-3 py-1.5 text-xs text-[var(--danger)] border border-[var(--danger)] rounded-[var(--radius-md)] hover:bg-[var(--danger-light)]"
                >
                  {paid ? "수납 취소 (환불 확정)" : "의뢰 취소"}
                </ConfirmButton>
              </form>
            )}

            {/* 입금 후 취소한 건은 환불 송금 후 이 버튼으로 원장에 기록함 */}
            {payment.status === "CANCELLED" && payment.paidAt && !payment.refundSentAt && (
              <form action={confirmPaymentRefundSentAction} className="space-y-2">
                <input type="hidden" name="paymentId" value={payment.id} />
                <p className="text-xs text-[var(--warning)]">
                  수납이 취소됐지만 <strong>환불 송금 기록이 없습니다.</strong> 기업 계좌로
                  이체한 뒤 아래를 누르세요.
                </p>
                <ConfirmButton
                  message={`${order.orderNo} 환불을 기업 계좌로 송금했습니까?\n\n· 원장에 환불 출금으로 기록되고 되돌릴 수 없습니다.\n· 실제로 송금한 뒤에만 누르세요.\n\n정말 송금 완료로 처리하시겠습니까?`}
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--warning)] text-[var(--warning)] rounded-[var(--radius-md)] hover:bg-[var(--warning-light)]"
                >
                  환불 송금 완료
                </ConfirmButton>
              </form>
            )}
            {payment.refundSentAt && (
              <p className="text-xs text-[var(--muted)]">환불 송금 완료 · 원장 반영됨</p>
            )}

            {/* 발행 후 환불했으면 수정세금계산서가 필요함. 발행은 팝빌·홈택스에서 직접 하고 여기서 완료만 기록함 */}
            {needsTaxInvoiceAmendment(payment, order) && (
              <form action={markTaxInvoiceAmendedAction} className="space-y-2">
                <input type="hidden" name="paymentId" value={payment.id} />
                <p className="text-xs text-[var(--danger)]">
                  환불이 발생했으나 <strong>수정세금계산서가 발행되지 않았습니다.</strong>{" "}
                  발행된 계산서를 그대로 두면 매출·매출세액이 과대 신고됩니다. 팝빌 또는
                  홈택스에서 수정세금계산서를 발행한 후 아래를 누르세요.
                </p>
                <ConfirmButton
                  message={"팝빌 또는 홈택스에서 수정세금계산서를 실제로 발행했습니까?\n\n· 누르면 이 경고가 사라지고 다시 뜨지 않습니다.\n· 발행하지 않았는데 누르면 매출이 과대 신고된 채로 남습니다.\n\n정말 발행 완료로 처리하시겠습니까?"}
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--danger)] text-[var(--danger)] rounded-[var(--radius-md)] hover:bg-[var(--danger-light)]"
                >
                  수정세금계산서 발행 완료
                </ConfirmButton>
              </form>
            )}
            {payment.taxInvoiceAmendedAt && (
              <p className="text-xs text-[var(--muted)]">
                수정세금계산서 발행 완료 · {seoul(payment.taxInvoiceAmendedAt)}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
