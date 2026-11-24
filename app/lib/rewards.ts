import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import * as ledger from "./ledger";
import { createNotifications } from "./notify";
import { computeWithholding, nominalRateBp, type IncomeType } from "./withholding";
import { isPayerUs, capacityOf } from "./approvals";

const digits = (v: string | null | undefined) => (v ?? "").replace(/[^0-9]/g, "");
const INCOME_TYPE_KEY = "reward_income_type";

export async function getIncomeType(): Promise<IncomeType> {
  const row = await prisma.appSetting.findUnique({ where: { key: INCOME_TYPE_KEY } });
  return row?.value === "BUSINESS" ? "BUSINESS" : "OTHER";
}

export async function setIncomeType(value: IncomeType): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: INCOME_TYPE_KEY },
    update: { value },
    create: { key: INCOME_TYPE_KEY, value },
  });
}

// 발주 단위 자문 잠금으로 동시 제출 시 정원 초과 보상 생성 방지
async function createRewardWithinCapacity(
  orderId: string,
  capacity: number,
  data: Prisma.RewardUncheckedCreateInput,
): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
      if ((await tx.reward.count({ where: { orderId } })) >= capacity) return false;
      await tx.reward.create({ data });
      return true;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

export async function createRewardForResponse(responseId: string): Promise<boolean> {
  const response = await prisma.response.findUnique({
    where: { id: responseId },
    include: { project: { include: { order: true } } },
  });
  if (!response) return false;

  const project = response.project;
  if (!isPayerUs(project.fundingType)) return false;

  const order = project.order;
  if (!order) return false;
  if (order.status === "SETTLED" || order.status === "CANCELLED" || order.status === "REFUNDED") return false;
  if (project.fundingType === "COMPANY" && order.status !== "PAID" && order.status !== "IN_PROGRESS") {
    return false;
  }

  const capacity = capacityOf({ maxParticipants: project.maxParticipants, order });
  const gross = order.rewardPerPerson;
  const incomeType = await getIncomeType();
  const w = computeWithholding(gross, incomeType);

  const made = await createRewardWithinCapacity(order.id, capacity, {
    orderId: order.id,
    userId: response.userId,
    responseId: response.id,
    grossAmount: gross,
    incomeType,
    taxRateBp: nominalRateBp(incomeType),
    taxAmount: w.taxAmount,
    taxExempt: w.exempt,
    netAmount: w.netAmount,
    status: "PENDING",
  });
  if (made && order.status === "PAID") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
  }
  return made;
}

export async function backfillRewardsForOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, projectId: true, surveyVersionId: true },
  });
  if (!order) return 0;
  if (order.status !== "PAID" && order.status !== "IN_PROGRESS") return 0;

  let created = 0;

  if (order.projectId) {
    const orphans = await prisma.response.findMany({
      where: { projectId: order.projectId, reward: null },
      select: { id: true },
    });
    for (const r of orphans) {
      if (await createRewardForResponse(r.id)) created++;
    }
  }

  if (order.surveyVersionId) {
    const orphans = await prisma.surveyResponse.findMany({
      where: { surveyVersionId: order.surveyVersionId, reward: null },
      select: { id: true },
    });
    for (const r of orphans) {
      if (await createRewardForSurveyResponse(r.id)) created++;
    }
  }

  return created;
}

export async function createRewardForSurveyResponse(surveyResponseId: string): Promise<boolean> {
  const response = await prisma.surveyResponse.findUnique({
    where: { id: surveyResponseId },
    include: { surveyVersion: { include: { order: true } } },
  });
  if (!response) return false;

  const order = response.surveyVersion.order;
  if (!order) return false;
  if (order.status !== "PAID" && order.status !== "IN_PROGRESS") return false;

  const gross = order.rewardPerPerson;
  const incomeType = await getIncomeType();
  const w = computeWithholding(gross, incomeType);

  const made = await createRewardWithinCapacity(order.id, order.panelSize, {
    orderId: order.id,
    userId: response.userId,
    surveyResponseId: response.id,
    grossAmount: gross,
    incomeType,
    taxRateBp: nominalRateBp(incomeType),
    taxAmount: w.taxAmount,
    taxExempt: w.exempt,
    netAmount: w.netAmount,
    status: "PENDING",
  });
  if (made && order.status === "PAID") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
  }
  return made;
}

export async function adjustRewardAmount(
  rewardId: string,
  adminId: string,
  grossAmount: number,
  reason?: string,
): Promise<number> {
  const gross = Math.max(0, Math.floor(grossAmount));
  const current = await prisma.reward.findUnique({
    where: { id: rewardId },
    select: { incomeType: true, status: true },
  });
  if (!current || current.status !== "PENDING") return 0;

  const incomeType = (current.incomeType === "BUSINESS" ? "BUSINESS" : "OTHER") as IncomeType;
  const w = computeWithholding(gross, incomeType);

  const r = await prisma.reward.updateMany({
    where: { id: rewardId, status: "PENDING" },
    data: {
      grossAmount: gross,
      taxAmount: w.taxAmount,
      taxExempt: w.exempt,
      netAmount: w.netAmount,
      adjustedAt: new Date(),
      adjustedById: adminId,
      adjustReason: (reason ?? "").trim().slice(0, 200) || null,
    },
  });
  return r.count;
}

export async function reviewReward(
  rewardId: string,
  adminId: string,
  approve: boolean,
  rejectReason?: string,
): Promise<number> {
  const r = await prisma.reward.updateMany({
    where: { id: rewardId, status: "PENDING" },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectReason: approve ? null : (rejectReason ?? "검수 반려"),
    },
  });
  return r.count;
}

export interface PayoutRow {
  payoutId: string;
  rewardId: string;
  userName: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  amount: number;
  status: string;
  failReason: string;
}

export interface GenerateResult {
  created: number;
  missingProfile: { userId: string; userName: string }[];
}

export async function generatePayouts(orderId: string): Promise<GenerateResult> {
  const rewards = await prisma.reward.findMany({
    where: { orderId, status: "APPROVED", payout: null },
    include: { user: { include: { payrollProfile: true } } },
  });

  let created = 0;
  const missingProfile: { userId: string; userName: string }[] = [];

  for (const r of rewards) {
    const p = r.user.payrollProfile;
    if (!p?.bankName || !digits(p.accountNumber)) {
      missingProfile.push({ userId: r.userId, userName: r.user.name });
      continue;
    }
    try {
      await prisma.payout.create({
        data: {
          rewardId: r.id,
          driver: "manual",
          payoutKey: `payout-${r.id}`,
          bankName: p.bankName,
          accountNumber: digits(p.accountNumber),
          holderName: p.holderName?.trim() || r.user.name,
          amount: r.netAmount,
          status: "PENDING",
        },
      });
      created++;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return { created, missingProfile };
}

export async function listPayoutRows(orderId: string): Promise<PayoutRow[]> {
  const payouts = await prisma.payout.findMany({
    where: { reward: { orderId }, status: { in: ["PENDING", "FAILED"] } },
    include: { reward: { include: { user: true } } },
    orderBy: { createdAt: "asc" },
  });
  return payouts.map((p) => ({
    payoutId: p.id,
    rewardId: p.rewardId,
    userName: p.reward.user.name,
    bankName: p.bankName,
    accountNumber: p.accountNumber,
    holderName: p.holderName,
    amount: p.amount,
    status: p.status,
    failReason: p.failReason ?? "",
  }));
}

export async function confirmPayoutPaid(payoutId: string): Promise<boolean> {
  const p = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { reward: true },
  });
  if (!p) return false;

  const done = await prisma.$transaction(async (tx) => {
    const swap = await tx.payout.updateMany({
      where: { id: p.id, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      data: { status: "PAID", paidAt: new Date(), failReason: null },
    });
    if (swap.count === 0) return false;

    await tx.reward.update({ where: { id: p.rewardId }, data: { status: "PAID" } });

    await ledger.recordPayout(tx, {
      payoutId: p.id,
      orderId: p.reward.orderId,
      netAmount: p.reward.netAmount,
      taxAmount: p.reward.taxAmount,
      memo: `참여 보상 지급 (${p.holderName})`,
    });
    return true;
  });

  if (done) {
    try {
      await createNotifications(
        [
          {
            userId: p.reward.userId,
            content: `평가 보상 ${p.amount.toLocaleString("ko-KR")}원이 입금되었습니다.`,
            type: "SETTLEMENT",
          },
        ],
        { link: "/dashboard" },
      );
    } catch {}
  }
  return done;
}

export async function markPayoutFailed(payoutId: string, reason: string): Promise<boolean> {
  const p = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { reward: { select: { userId: true } } },
  });
  if (!p || p.status === "PAID") return false;

  const memo = reason.trim() || "이체 실패";
  const done = await prisma.$transaction(async (tx) => {
    const swap = await tx.payout.updateMany({
      where: { id: payoutId, status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      data: { status: "FAILED", failReason: memo },
    });
    if (swap.count === 0) return false;
    await tx.reward.update({ where: { id: p.rewardId }, data: { status: "FAILED" } });
    return true;
  });

  if (done) {
    try {
      await createNotifications(
        [
          {
            userId: p.reward.userId,
            content: `평가 보상 이체가 실패했습니다 (${memo}). 계좌·예금주 정보를 확인해 주세요.`,
            type: "SETTLEMENT",
          },
        ],
        { link: "/dashboard" },
      );
    } catch {}
  }
  return done;
}

export async function retryPayout(payoutId: string): Promise<boolean> {
  const p = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { reward: { include: { user: { include: { payrollProfile: true } } } } },
  });
  if (!p || p.status !== "FAILED") return false;

  const prof = p.reward.user.payrollProfile;
  if (!prof?.bankName || !digits(prof.accountNumber)) return false;

  return prisma.$transaction(async (tx) => {
    const swap = await tx.payout.updateMany({
      where: { id: payoutId, status: "FAILED" },
      data: {
        status: "PENDING",
        failReason: null,
        bankName: prof.bankName!,
        accountNumber: digits(prof.accountNumber),
        holderName: prof.holderName?.trim() || p.reward.user.name,
      },
    });
    if (swap.count === 0) return false;
    await tx.reward.update({ where: { id: p.rewardId }, data: { status: "APPROVED" } });
    return true;
  });
}

export async function confirmPayoutsPaid(orderId: string): Promise<number> {
  const payouts = await prisma.payout.findMany({
    where: { reward: { orderId }, status: "PENDING" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let count = 0;
  for (const p of payouts) {
    if (await confirmPayoutPaid(p.id)) count++;
  }
  return count;
}
