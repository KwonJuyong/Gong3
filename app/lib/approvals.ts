import { Prisma } from "@prisma/client";
import { prisma } from "@/app/db";
import { createNotifications } from "./notify";

/**
 * 평가(Project) 공개 조건과 자금 출처 판정.
 *
 * 공개 조건: 관리자 승인, 마감 전, 정원 미달.
 * 발주는 평가 전후 어느 때나 연결할 수 있고, 자금 상태는 승인 화면에 보여주기만 하며
 * 공개를 막지 않는다(연구비 건은 평가가 끝난 뒤 청구한다).
 *
 * questionSource(AUTO|MANUAL)와 fundingType(COMPANY|UNIVERSITY|RESEARCH_FUND)은 서로 독립이다.
 * 공개 조건은 이 파일에서만 정의한다.
 */

/** 입금이 확인된 발주 상태 */
const PAID_ORDER_STATUSES = ["PAID", "IN_PROGRESS", "SETTLED"] as const;

/** 학생에게 보이면 안 되는 Project 상태. */
export const HIDDEN_PROJECT_STATUSES = ["PENDING_APPROVAL", "REJECTED"] as const;

export const FUNDING_TYPES = ["COMPANY", "UNIVERSITY", "RESEARCH_FUND"] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

export const FUNDING_LABEL: Record<string, string> = {
  COMPANY: "업체 · 기업자산 결제",
  UNIVERSITY: "학교 · 계약거래",
  RESEARCH_FUND: "교수 · 연구비 노무비",
};

/** 자금 확인 근거(승인 화면 안내 문구) */
export const FUNDING_EVIDENCE: Record<string, string> = {
  COMPANY: "입금 확인 (선불)",
  UNIVERSITY: "계약 확인 (⚠ 통상 후불 — 대금은 검수 후에 들어온다)",
  RESEARCH_FUND: "과제·노무비 예산 확인 (지급은 산학협력단이 한다)",
};

/**
 * 플랫폼이 보상의 지급자인지.
 * 업체·학교 건은 플랫폼이 지급하고 원천징수한다(Reward → Payout).
 * 연구비 건은 산학협력단이 지급하므로 Reward 를 만들지 않고 노무비 서류(LaborClaim)만 만든다.
 */
export function isPayerUs(fundingType: string): boolean {
  return fundingType === "COMPANY" || fundingType === "UNIVERSITY";
}

/** 모집 정원. 발주가 있으면 Order.panelSize, 없으면 Project.maxParticipants. */
export function capacityOf(p: {
  maxParticipants: number;
  order?: { panelSize: number } | null;
}): number {
  return p.order?.panelSize ?? p.maxParticipants;
}

/** 1인 보상액. 발주가 있으면 그게 정본, 없으면(연구비) Project 값. */
export function rewardPerPersonOf(p: {
  rewardPerPerson: number | null;
  order?: { rewardPerPerson: number } | null;
}): number {
  return p.order?.rewardPerPerson ?? p.rewardPerPerson ?? 0;
}

/**
 * 자금 확보 여부(승인 화면 표시용). 공개 판정에는 쓰지 않는다.
 * 연구비 건은 사후 청구라 null.
 */
export function fundStatusOf(p: {
  fundingType: string;
  fundConfirmedAt?: Date | null;
  order?: { status: string } | null;
}): boolean | null {
  if (p.fundingType === "COMPANY") {
    return !!p.order && PAID_ORDER_STATUSES.includes(p.order.status as (typeof PAID_ORDER_STATUSES)[number]);
  }
  if (p.fundingType === "UNIVERSITY") return p.fundConfirmedAt != null;
  return null; // RESEARCH_FUND: 평가 종료 후 노무비로 청구
}

/**
 * 학생에게 보이는 평가(승인된 것, 종료 포함).
 * 대시보드 payload 에 문항·신청자까지 실리므로 클라이언트가 아니라 서버 쿼리에서 거른다.
 */
export const visibleProjectWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES] },
};

/**
 * 지금 응답을 받을 수 있는 평가(승인 + 마감 전).
 * 정원은 where 로 셀 수 없어서 정원이 차면 제출 액션이 closedAt 을 기록하고,
 * 동시 제출에 대비해 createRewardForResponse 에서 한 번 더 확인한다.
 */
export const openProjectWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES] },
  closedAt: null,
};

/**
 * 레거시: SurveyVersion 에 직접 응답하던 방식의 공개 조건.
 * 새 발주는 Order.projectId 로 연결되므로 여기 걸리지 않는다. 기존 건을 위해 남겨 둔다.
 */
export const legacySurveyWhere: Prisma.SurveyVersionWhereInput = {
  status: "CONFIRMED",
  approvedAt: { not: null },
  order: { is: { status: { in: [...PAID_ORDER_STATUSES] } } },
};

/** 관리자 전원의 id. 검토 요청을 보낼 대상. */
async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** [생성 직후] 관리자에게 검토를 요청한다. 학생 알림은 승인 후에 보낸다. */
export async function notifyAdminsForReview(input: {
  title: string;
  requesterId: string;
  link?: string;
}) {
  const ids = await adminIds();
  if (ids.length === 0) return;

  await createNotifications(
    ids
      .filter((id) => id !== input.requesterId)
      .map((userId) => ({
        userId,
        type: "INFO",
        content: `평가 승인 요청: ${input.title}`,
        fromUserId: input.requesterId,
      })),
    { link: input.link ?? "/dashboard/approvals" },
  );
}

/** [승인 직후] 학생 전체에게 모집을 알린다. */
export async function notifyEveryonePublished(input: {
  title: string;
  approverId: string;
  creatorId?: string | null;
  link?: string;
}) {
  const users = await prisma.user.findMany({ select: { id: true } });
  const exclude = new Set([input.approverId, input.creatorId].filter(Boolean) as string[]);

  await createNotifications(
    users
      .filter((u) => !exclude.has(u.id))
      .map((u) => ({
        userId: u.id,
        type: "INFO",
        content: `새 평가가 참여자를 모집합니다: ${input.title}`,
        fromUserId: input.approverId,
      })),
    { link: input.link ?? "/dashboard" },
  );
}

/** [반려] 생성자에게 사유를 알린다. */
export async function notifyCreatorRejected(input: {
  title: string;
  reason: string;
  approverId: string;
  creatorId?: string | null;
  link?: string;
}) {
  if (!input.creatorId) return;

  await createNotifications(
    [
      {
        userId: input.creatorId,
        type: "INFO",
        content: `평가가 반려되었습니다: ${input.title} — ${input.reason}`,
        fromUserId: input.approverId,
      },
    ],
    { link: input.link ?? "/dashboard" },
  );
}

/**
 * 발주가 연결되지 않은 업체·학교 평가. 이 상태에서는 응답해도 보상이 생기지 않는다.
 * 연구비 건은 발주가 없는 게 정상이라 제외한다.
 */
export const orderMissingWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES] },
  fundingType: { in: ["COMPANY", "UNIVERSITY"] },
  order: { is: null },
};

/** 관리 메뉴 배지 건수: 승인 대기 + 발주 미연결 업체·학교 평가. */
export async function pendingApprovalCount(): Promise<number> {
  const [pending, orderMissing] = await Promise.all([
    prisma.project.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.project.count({ where: orderMissingWhere }),
  ]);
  return pending + orderMissing;
}
