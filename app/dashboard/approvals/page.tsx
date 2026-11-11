import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import {
  FUNDING_LABEL,
  FUNDING_EVIDENCE,
  capacityOf,
  rewardPerPersonOf,
  isPayerUs,
  fundStatusOf,
  orderMissingWhere,
} from "../../lib/approvals";
import {
  approveProjectAction,
  rejectProjectAction,
  confirmFundingAction,
  linkOrderToProjectAction,
} from "./actions";

export const metadata = { title: "평가 승인" };

/**
 * 평가 승인 화면(ADMIN). 문항을 펼쳐 보고 승인·반려함
 *
 * 1. 승인 대기
 * 2. 발주 미연결: 공개됐지만 보상이 생기지 않는 업체·학교 평가(연구비 건 제외)
 *
 * 자금 상태는 판단용으로 표시만 하고 승인을 막지 않음
 */

function seoul(d: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(d);
}

const NOTE: Record<string, { text: string; tone: "ok" | "warn" | "mute" }> = {
  approved: { text: "승인했습니다. 학생에게 공개되고 모집 알림이 발송되었습니다.", tone: "ok" },
  rejected: { text: "반려했습니다. 사유가 개설자에게 전달되었습니다.", tone: "mute" },
  linked: { text: "의뢰를 연결했습니다. 기존 응답에 대한 보상은 소급 생성됩니다.", tone: "ok" },
  funded: { text: "계약 확인을 기록했습니다. (공개 여부와는 무관한 장부 기록입니다)", tone: "ok" },
  already: { text: "이미 처리된 건입니다. 중복 알림은 발송되지 않았습니다.", tone: "warn" },
  taken: { text: "그 의뢰는 이미 다른 평가에 연결되어 있습니다.", tone: "warn" },
  company: {
    text: "계약 확인 기록은 교육기관 건에만 씁니다. 기업은 의뢰 화면에서 입금을 확인하고(원장에 함께 기록됩니다), 연구비는 평가 종료 후 노무비로 청구합니다.",
    tone: "warn",
  },
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "ADMIN") redirect("/dashboard");

  const q = await searchParams;
  const noteKey = Object.keys(NOTE).find((k) => q[k]);
  const note = noteKey ? NOTE[noteKey] : null;

  const include = {
    creator: { select: { name: true, major: true } },
    surveyVersion: { select: { round: true, service: { select: { name: true } } } },
    order: { select: { orderNo: true, status: true, panelSize: true, rewardPerPerson: true } },
    _count: { select: { responses: true } },
  } as const;

  const [pending, orderMissing, linkableOrders] = await Promise.all([
    prisma.project.findMany({
      where: { status: "PENDING_APPROVAL" },
      include,
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({ where: orderMissingWhere, include, orderBy: { createdAt: "desc" } }),
    // 아직 평가에 연결되지 않은 발주(취소·환불 제외)
    prisma.order.findMany({
      where: { projectId: null, status: { in: ["PENDING", "PAID"] } },
      select: {
        id: true,
        orderNo: true,
        status: true,
        panelSize: true,
        rewardPerPerson: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const card =
    "bg-white rounded-[var(--radius-xl)] p-5";
  const primaryBtn =
    "px-4 py-2 text-sm font-semibold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]";
  const dangerBtn =
    "px-3 py-2 text-sm font-medium border border-[var(--danger)] text-[var(--danger)] rounded-[var(--radius-md)] hover:bg-[var(--danger-light)]";
  const ghostBtn =
    "px-3 py-2 text-sm font-medium border border-[var(--gray-200)] text-[var(--muted)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]";
  const input =
    "flex-1 min-w-0 px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]";

  type Row = (typeof pending)[number];

  const Card = ({ p, mode }: { p: Row; mode: "approve" | "order" }) => {
    const questions = (p.questions as unknown as { label?: string }[]) || [];
    const capacity = capacityOf(p);
    const unit = rewardPerPersonOf(p);
    const fundReady = fundStatusOf(p);

    return (
      <section className={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-[var(--muted)]">
              {p.questionSource === "AUTO" ? "자동 생성" : "수동 생성"}
              {p.surveyVersion &&
                ` · ${p.surveyVersion.service.name} 회차 ${p.surveyVersion.round}`}
            </p>
            <h3 className="text-base font-semibold text-[var(--foreground)] mt-0.5">{p.title}</h3>
            <p className="text-xs text-[var(--muted)] mt-1">
              {p.creator?.name || "알 수 없음"}
              {p.creator?.major ? ` · ${p.creator.major}` : ""} · 요청 {seoul(p.createdAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
              {FUNDING_LABEL[p.fundingType] ?? p.fundingType}
            </span>
            <span className="text-xs text-[var(--muted)]">
              정원 {capacity}명
              {unit > 0 && ` · 1인 ${unit.toLocaleString("ko-KR")}원`}
            </span>
          </div>
        </div>

        {p.description && (
          <p className="text-sm text-[var(--muted)] mt-3 whitespace-pre-wrap">{p.description}</p>
        )}

        {/* 자금 상태(참고용) */}
        <div className="mt-3 text-xs bg-[var(--gray-50)] rounded-[var(--radius-md)] px-3 py-2.5 space-y-1 leading-relaxed">
          <p>
            <strong>자금 근거</strong> — {FUNDING_EVIDENCE[p.fundingType]}
          </p>
          {p.order ? (
            <p className="text-[var(--muted)]">
              의뢰 {p.order.orderNo} · {fundReady ? "입금 확인됨" : "입금 대기"} ·{" "}
              {p.order.panelSize}명 × {p.order.rewardPerPerson.toLocaleString("ko-KR")}원
            </p>
          ) : (
            isPayerUs(p.fundingType) && (
              <p className="text-[var(--warning)]">
                의뢰가 없습니다. <strong>공개는 되지만 보상이 생기지 않습니다.</strong>{" "}
                의뢰는 나중에 연결할 수 있고, 연결하면 기존 응답분도 소급 생성됩니다.
              </p>
            )
          )}
          {p.contractRef && <p className="text-[var(--muted)]">계약번호 {p.contractRef}</p>}
          {p.fundRef && <p className="text-[var(--muted)]">과제번호 {p.fundRef}</p>}
          {p.fundConfirmedAt && (
            <p className="text-[var(--muted)]">계약 확인 기록 {seoul(p.fundConfirmedAt)}</p>
          )}
          {!isPayerUs(p.fundingType) && (
            <p className="text-[var(--muted)]">
              지급은 <strong>산학협력단</strong>이 노무비로 합니다. 보상(Reward)을 만들지 않습니다.
              <br />
              평가가 <strong>끝난 뒤</strong> 노무비 청구가 의뢰와 정산을 대체하므로, 사전에
              확인할 자금이 없습니다.
            </p>
          )}
        </div>

        <details className="mt-3">
          <summary className="text-xs text-[var(--accent)] cursor-pointer">
            문항 {questions.length}개 보기
          </summary>
          <ol className="mt-2 pl-5 list-decimal space-y-1">
            {questions.map((qq, i) => (
              <li key={i} className="text-sm text-[var(--foreground)]">
                {qq.label || "(빈 문항)"}
              </li>
            ))}
          </ol>
        </details>

        {mode === "approve" ? (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <form action={approveProjectAction}>
              <input type="hidden" name="projectId" value={p.id} />
              <ConfirmButton
                message={
                  `「${p.title}」을(를) 승인하고 공개합니다.\n\n` +
                  "· 즉시 학생 전체에게 모집 알림이 나갑니다. 알림은 회수할 수 없습니다.\n" +
                  (!p.order && isPayerUs(p.fundingType)
                    ? "· 의뢰가 연결되지 않아 지금은 응답해도 보상이 생기지 않습니다.\n"
                    : "") +
                  "\n정말 승인하시겠습니까?"
                }
                className={primaryBtn}
              >
                승인 · 공개
              </ConfirmButton>
            </form>
            <form action={rejectProjectAction} className="flex items-center gap-2 flex-1 min-w-[260px]">
              <input type="hidden" name="projectId" value={p.id} />
              <input name="reason" placeholder="반려 사유 (개설자에게 전달됩니다)" className={input} />
              <ConfirmButton
                message={`「${p.title}」을(를) 반려합니다(사유: {reason}).\n\n· 개설자에게 사유와 함께 알림이 갑니다.\n· 다시 공개하려면 개설자가 새로 요청해야 합니다.\n\n정말 반려하시겠습니까?`}
                className={dangerBtn}
              >
                반려
              </ConfirmButton>
            </form>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
              이 평가는 <strong>이미 공개되어 있습니다.</strong> 의뢰를 연결하면 정원·1인 보상액의
              정본이 의뢰로 넘어가고, 이미 들어온 응답 {p._count.responses}건에 대한 보상이 소급
              생성됩니다.
            </p>
            {linkableOrders.length > 0 ? (
              <form action={linkOrderToProjectAction} className="flex items-center gap-2 flex-wrap">
                <input type="hidden" name="projectId" value={p.id} />
                <select name="orderId" required className={input} defaultValue="">
                  <option value="" disabled>
                    연결할 의뢰를 고르세요
                  </option>
                  {linkableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNo} · {o.service.name} · {o.panelSize}명 ×{" "}
                      {o.rewardPerPerson.toLocaleString("ko-KR")}원
                      {o.status === "PAID" ? " · 입금완료" : " · 입금대기"}
                    </option>
                  ))}
                </select>
                <ConfirmButton
                  message={`「${p.title}」에 의뢰 {orderId} 을(를) 연결합니다.\n\n· 정원·1인 보상액의 기준이 이 의뢰로 바뀝니다.\n· 이미 들어온 응답 ${p._count.responses}건의 보상이 소급 생성됩니다.\n· 연결은 화면에서 풀 수 없습니다.\n\n정말 연결하시겠습니까?`}
                  className={primaryBtn}
                >
                  의뢰 연결
                </ConfirmButton>
              </form>
            ) : (
              <p className="text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
                연결할 수 있는 의뢰가 없습니다.{" "}
                <Link href="/dashboard/orders" className="underline font-semibold">
                  평가 의뢰
                </Link>
                에서 먼저 의뢰를 만드세요.
              </p>
            )}
            {p.fundingType === "UNIVERSITY" && !p.fundConfirmedAt && (
              <form action={confirmFundingAction}>
                <input type="hidden" name="projectId" value={p.id} />
                <ConfirmButton
                  message={`「${p.title}」의 교육기관 계약서를 확인했다고 기록합니다.\n\n· 확인한 관리자와 시각이 남고, 화면에서 지울 수 없습니다.\n\n정말 기록하시겠습니까?`}
                  className={ghostBtn}
                >
                  계약 확인 기록 (장부용)
                </ConfirmButton>
              </form>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={Object.keys(NOTE)} />
        <div>
          <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">평가 승인</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            <strong>승인하면 곧바로 공개</strong>되고 학생에게 모집 알림이 나갑니다. 의뢰·자금은
            별개 트랙이라 공개를 막지 않습니다. 아래 자금 상태를 보고 판단하세요. 승인은 이 건
            하나에만 적용되며 다음 평가는 다시 요청됩니다.
          </p>
        </div>
        {note && (
          <p
            className={`text-sm px-4 py-3 rounded-[var(--radius-md)] ${
              note.tone === "ok"
                ? "text-[var(--success)] bg-[var(--success-light)]"
                : note.tone === "warn"
                  ? "text-[var(--warning)] bg-[var(--warning-light)]"
                  : "text-[var(--muted)] bg-[var(--gray-50)]"
            }`}
          >
            {note.text}
          </p>
        )}

        {pending.length === 0 && orderMissing.length === 0 && (
          <p className="text-sm text-[var(--gray-500)] text-center py-16">
            처리할 평가가 없습니다.
          </p>
        )}

        {pending.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              승인 대기 <span className="text-[var(--muted)] font-normal">{pending.length}건</span>
            </h3>
            {pending.map((p) => (
              <Card key={p.id} p={p} mode="approve" />
            ))}
          </section>
        )}

        {orderMissing.length > 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                의뢰 미연결{" "}
                <span className="text-[var(--muted)] font-normal">{orderMissing.length}건</span>
              </h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                공개는 되어 있지만 <strong>보상이 생기지 않는</strong> 기업·교육기관 평가입니다.
                방치하면 학생이 무보수로 응답합니다.
              </p>
            </div>
            {orderMissing.map((p) => (
              <Card key={p.id} p={p} mode="order" />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
