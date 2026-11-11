import ClearQueryParams from "@/app/components/ClearQueryParams";
import SubmitButton from "@/app/components/SubmitButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import { won, DEFAULT_FEE_RATE_BP } from "../../lib/money";
import OrderForm from "./OrderForm";
import { getBizProfile, canTransact } from "../../lib/bizProfile";
import { syncDepositsAction, syncInvoiceStatesAction } from "./actions";
import ReauthField from "@/app/components/ReauthField";

export const metadata = { title: "평가 의뢰" };

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "작성 중", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  PENDING: { text: "입금 대기", cls: "bg-[var(--warning-light)] text-[var(--warning)]" },
  PAID: { text: "입금 완료", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  IN_PROGRESS: { text: "평가 진행 중", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  SETTLED: { text: "정산 완료", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  CANCELLED: { text: "취소됨", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
  REFUNDED: { text: "환불됨", cls: "bg-[var(--gray-100)] text-[var(--gray-500)]" },
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    synced?: string;
    ambiguous?: string;
    ntsChecked?: string;
    ntsFailed?: string;
  }>;
}) {
  const q = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  // 사업자등록번호가 없으면 프로필의 기업 정보 탭으로 보냄(프로필이 읽는 ?error= 사용).
  if (!(await canTransact(me))) {
    redirect(
      `/dashboard/profile?tab=biz&error=${encodeURIComponent(
        "의뢰·견적서를 이용하려면 사업자등록번호를 먼저 등록해 주세요.",
      )}`,
    );
  }

  const admin = me.role === "ADMIN";

  const [services, orders, lastOrder, bizProfile] = await Promise.all([
    prisma.service.findMany({
      where: admin ? {} : { ownerId: me.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: admin ? {} : { buyerId: me.id },
      include: { service: true },
      orderBy: { createdAt: "desc" },
    }),
    // 프로필이 없을 때 쓰는 직전 발주의 기업 정보
    prisma.order.findFirst({
      where: { buyerId: me.id, bizName: { not: "" } },
      orderBy: { createdAt: "desc" },
      select: { bizNo: true, bizName: true, bizCeo: true, bizAddr: true, bizEmail: true },
    }),
    getBizProfile(me.id),
  ]);

  // 프리필 우선순위: 프로필(BizProfile) → 직전 발주 → 가입 이메일(이메일 칸만)
  const biz = {
    bizNo: bizProfile.bizNo || lastOrder?.bizNo || "",
    bizName: bizProfile.bizName || lastOrder?.bizName || "",
    bizCeo: bizProfile.bizCeo || lastOrder?.bizCeo || "",
    bizAddr: bizProfile.bizAddr || lastOrder?.bizAddr || "",
    bizEmail: bizProfile.bizEmail || lastOrder?.bizEmail || me.email || "",
  };

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["error", "synced", "ambiguous", "ntsChecked", "ntsFailed"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">평가 의뢰</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            모집 인원과 보상을 정해 의뢰하면, 결제 확인 후 모집이 시작됩니다.
          </p>
        </div>
        {q.error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
            {q.error}
          </p>
        )}
        {q.synced != null && (
          <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
            입금 {q.synced}건 자동 확인
            {Number(q.ambiguous) > 0 && ` · ${q.ambiguous}건은 금액이 겹쳐 수동 확인 필요`}
          </p>
        )}
        {q.ntsChecked != null &&
          (Number(q.ntsFailed) > 0 ? (
            <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
              국세청 전송실패 {q.ntsFailed}건: 의뢰 상세에서 확인하세요 ({q.ntsChecked}건 조회)
            </p>
          ) : (
            <p className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
              세금계산서 {q.ntsChecked}건 전송결과 확인 · 실패 없음
            </p>
          ))}

        {/* 관리자: 동기화 작업(입금계좌 등 설정은 조직 설정) */}
        {admin && (
          <section className="bg-white rounded-[var(--radius-xl)] border border-[var(--gray-300)] p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">관리자 작업</h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  입금내역 동기화로 대기 의뢰를 자동 확인·발행합니다.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <form action={syncInvoiceStatesAction}>
                  <SubmitButton className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]">
                    국세청 전송결과 확인
                  </SubmitButton>
                </form>
                <form action={syncDepositsAction} className="flex items-center gap-1.5">
                  <ReauthField className="w-40 py-1.5 text-xs" />
                  <SubmitButton className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]">
                    입금내역 동기화
                  </SubmitButton>
                </form>
                <Link
                  href="/dashboard/org"
                  className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                >
                  입금계좌·공급자 설정 →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* 새 발주(견적서도 같은 폼에서 발급) */}
        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">새 의뢰 · 견적서</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5 mb-4">
            한 번 입력하면 결재용 견적서(PDF)와 의뢰를 모두 진행할 수 있습니다.
          </p>

          {/* 서비스가 없어도 견적서는 낼 수 있도록 폼을 보여줌(발주 버튼은 잠김). */}
          {services.length === 0 && (
            <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] px-3 py-2.5 rounded-[var(--radius-md)] mb-4 leading-relaxed">
              등록된 서비스가 없습니다. 아래에서 <strong>평가명을 직접 입력해 견적서만</strong>{" "}
              발급할 수 있습니다. 의뢰까지 하려면 먼저{" "}
              <Link href="/dashboard/services" className="underline text-[var(--foreground)]">
                서비스를 등록
              </Link>
              하세요.
            </p>
          )}
          <OrderForm
            services={services.map((s) => ({ id: s.id, name: s.name }))}
            biz={biz}
            feeRateBp={DEFAULT_FEE_RATE_BP}
            allowFeeRate={admin}
          />
        </section>

        <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--gray-100)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">의뢰 내역</h3>
            <span className="text-xs text-[var(--muted)]">총 {orders.length}건</span>
          </div>

          {orders.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] text-center py-12">
              아직 의뢰가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                    <th className="px-4 py-3 font-semibold">주문번호</th>
                    <th className="px-4 py-3 font-semibold">서비스</th>
                    <th className="px-4 py-3 font-semibold">인원</th>
                    <th className="px-4 py-3 font-semibold">결제 금액</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const label = STATUS_LABEL[o.status] ?? STATUS_LABEL.DRAFT;
                    return (
                      <tr
                        key={o.id}
                        className="border-t border-[var(--gray-100)] hover:bg-[var(--gray-50)]"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/orders/${o.id}`}
                            className="font-mono text-xs text-[var(--foreground)] underline"
                          >
                            {o.orderNo}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[var(--foreground)]">{o.service.name}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{o.panelSize}명</td>
                        <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                          {won(o.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${label.cls}`}>
                            {label.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
