import { Prisma } from "@prisma/client";
import { prisma } from "@/app/db";
import { createNotifications } from "./notify";

const PAID_ORDER_STATUSES = ["PAID", "IN_PROGRESS", "SETTLED"] as const;
export const HIDDEN_PROJECT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "REJECTED"] as const;
export const FUNDING_TYPES = ["COMPANY", "UNIVERSITY", "RESEARCH_FUND"] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

export const FUNDING_LABEL: Record<string, string> = {
  COMPANY: "외부 의뢰형: 기업",
  UNIVERSITY: "외부 의뢰형: 교육기관 계약",
  RESEARCH_FUND: "연구과제형: 연구비",
};

export const FUNDING_EVIDENCE: Record<string, string> = {
  COMPANY: "입금 확인 (선불)",
  UNIVERSITY: "계약 확인 (통상 후불: 대금은 검수 후에 들어온다)",
  RESEARCH_FUND: "과제·노무비 예산 확인 (지급은 산학협력단이 한다)",
};

export function isPayerUs(fundingType: string): boolean {
  return fundingType === "COMPANY" || fundingType === "UNIVERSITY";
}

export function capacityOf(p: {
  maxParticipants: number;
  order?: { panelSize: number } | null;
}): number {
  return p.order?.panelSize ?? p.maxParticipants;
}

export function rewardPerPersonOf(p: {
  rewardPerPerson: number | null;
  order?: { rewardPerPerson: number } | null;
}): number {
  return p.order?.rewardPerPerson ?? p.rewardPerPerson ?? 0;
}

export function fundStatusOf(p: {
  fundingType: string;
  fundConfirmedAt?: Date | null;
  order?: { status: string } | null;
}): boolean | null {
  if (p.fundingType === "COMPANY") {
    return !!p.order && PAID_ORDER_STATUSES.includes(p.order.status as (typeof PAID_ORDER_STATUSES)[number]);
  }
  if (p.fundingType === "UNIVERSITY") return p.fundConfirmedAt != null;
  return null;
}

export const visibleProjectWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES] },
};

export const openProjectWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES, "FINISHED"] },
  closedAt: null,
};

export const legacySurveyWhere: Prisma.SurveyVersionWhereInput = {
  status: "CONFIRMED",
  approvedAt: { not: null },
  order: { is: { status: { in: [...PAID_ORDER_STATUSES] } } },
};

async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

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
        content: `새 평가가 평가자를 모집합니다: ${input.title}`,
        fromUserId: input.approverId,
      })),
    { link: input.link ?? "/dashboard" },
  );
  if (input.creatorId && input.creatorId !== input.approverId) {
    await createNotifications(
      [{ userId: input.creatorId, type: "INFO", content: `평가가 승인되어 모집을 시작했어요: ${input.title}`, fromUserId: input.approverId }],
      { link: input.link ?? "/dashboard" },
    );
  }
}

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
        content: `평가가 반려되었습니다: ${input.title}: ${input.reason}`,
        fromUserId: input.approverId,
      },
    ],
    { link: input.link ?? "/dashboard" },
  );
}

export const orderMissingWhere: Prisma.ProjectWhereInput = {
  status: { notIn: [...HIDDEN_PROJECT_STATUSES, "FINISHED"] },
  fundingType: { in: ["COMPANY", "UNIVERSITY"] },
  order: { is: null },
};

export async function pendingApprovalCount(): Promise<number> {
  const [pending, orderMissing] = await Promise.all([
    prisma.project.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.project.count({ where: orderMissingWhere }),
  ]);
  return pending + orderMissing;
}
