/**
 * 평가단 보상: 생성 · 검수 · 지급.
 *
 *   학생이 유료 평가에 응답 → Reward(PENDING) 생성(원천징수 계산값 저장)
 *   관리자 검수 → APPROVED / REJECTED
 *   승인분 → Payout 생성 → 관리자가 한 건씩 이체 → 건별로 완료·실패 기록
 *          → 완료분만 원장에 PAYOUT_OUT + TAX_WITHHELD, Reward 는 PAID
 *
 * 이체는 건별로 실패할 수 있어 지급 확인도 건별(confirmPayoutPaid)로 함
 * 계좌·주민번호는 노무비와 같은 PayrollProfile 을 씀
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import * as ledger from "./ledger";
import { createNotifications } from "./notify";
import { computeWithholding, nominalRateBp, type IncomeType } from "./withholding";
import { isPayerUs, capacityOf } from "./approvals";

/** 계좌번호는 숫자만 남김 */
const digits = (v: string | null | undefined) => (v ?? "").replace(/[^0-9]/g, "");

const INCOME_TYPE_KEY = "reward_income_type";

/** 소득 구분 설정 (세무사 확정값). 기본 기타소득. */
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

/**
 * 정원 안에서만 보상 한 건을 만듦. 만들었으면 true.
 * 발주 단위 트랜잭션 잠금으로 세기와 만들기를 묶어 마지막 자리에 동시 제출이 와도 정원을 넘지 않음
 * 직렬화 격리는 다른 발주끼리도 충돌 오류가 나 보상이 빠질 수 있어 쓰지 않음
 * 같은 응답의 보상이 이미 있으면(P2002) false.
 */
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

/**
 * 응답 제출 시 호출. 유상 평가면 보상을 만듦. 멱등.
 * 원천징수는 이 시점에 계산해 저장하므로 이후 설정이 바뀌어도 이 건은 변하지 않음
 * SurveyVersion 에 직접 응답하던 이전 방식은 createRewardForSurveyResponse.
 */
export async function createRewardForResponse(responseId: string): Promise<boolean> {
  const response = await prisma.response.findUnique({
    where: { id: responseId },
    include: { project: { include: { order: true } } },
  });
  if (!response) return false;

  const project = response.project;

  // 연구비 건은 산학협력단이 지급하므로 Reward 를 만들지 않음
  if (!isPayerUs(project.fundingType)) return false;

  const order = project.order;
  // 발주가 없으면 보상 재원이 없음. 입금 전 응답은 입금 확인 때 backfillRewardsForOrder 가 만듦
  if (!order) return false;
  // 정산 마감·취소·환불된 발주에는 만들지 않음. 마감 때 확정한 환불액과 어긋남(학교 건도 마찬가지).
  if (order.status === "SETTLED" || order.status === "CANCELLED" || order.status === "REFUNDED") return false;
  // 학교 건은 후불이라 입금 전에도 보상을 만듦. 업체 건은 입금 후에만 만듦
  if (project.fundingType === "COMPANY" && order.status !== "PAID" && order.status !== "IN_PROGRESS") {
    return false;
  }

  // 정원을 넘는 보상은 만들지 않음. 응답 제출에서도 막지만 동시 제출로 넘칠 수 있음
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
  // 첫 응답이 들어오면 발주를 진행 중으로
  if (made && order.status === "PAID") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
  }
  return made;
}

/**
 * 입금 확인 시 호출. 입금 전에 들어온 응답의 보상을 소급 생성함. 멱등.
 * 무통장입금은 확인까지 며칠 걸릴 수 있어 그 사이 응답에는 Reward 가 없음
 */
export async function backfillRewardsForOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, projectId: true, surveyVersionId: true },
  });
  if (!order) return 0;
  if (order.status !== "PAID" && order.status !== "IN_PROGRESS") return 0;

  let created = 0;

  // 평가(Project) 응답
  if (order.projectId) {
    const orphans = await prisma.response.findMany({
      where: { projectId: order.projectId, reward: null },
      select: { id: true },
    });
    for (const r of orphans) {
      if (await createRewardForResponse(r.id)) created++;
    }
  }

  // 이전 방식: SurveyVersion 에 직접 응답한 건
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

/**
 * 이전 방식(SurveyVersion 직접 응답)의 보상 생성.
 * 새 발주는 Order.projectId 로 연결되므로 기존 건의 소급 생성에만 쓰임
 */
export async function createRewardForSurveyResponse(surveyResponseId: string): Promise<boolean> {
  const response = await prisma.surveyResponse.findUnique({
    where: { id: surveyResponseId },
    include: { surveyVersion: { include: { order: true } } },
  });
  if (!response) return false;

  const order = response.surveyVersion.order;
  if (!order) return false;
  if (order.status !== "PAID" && order.status !== "IN_PROGRESS") return false;

  // 정원 초과 방어는 새 경로와 동일하게 걸기
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

/**
 * 개인 보상액을 바꿈. PENDING 만 대상임
 *
 * 발주는 모두에게 같은 단가를 주지만 같은 회차 안에서도 참여 시간이 사람마다 다를 수 있어
 * 검수 단계에서 개인별로 조정함. 금액이 바뀌면 과세최저한 판정이 달라질 수 있어 세금도
 * 다시 계산함. 지급 후에는 원장·신고와 어긋나므로 바꿀 수 없음
 *
 * @returns 바뀐 건수. 0 이면 PENDING 이 아니었음
 */
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

/** 승인/반려. PENDING 만 대상. */
export async function reviewReward(
  rewardId: string,
  adminId: string,
  approve: boolean,
  rejectReason?: string,
): Promise<void> {
  await prisma.reward.updateMany({
    where: { id: rewardId, status: "PENDING" },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectReason: approve ? null : (rejectReason ?? "검수 반려"),
    },
  });
}

export interface PayoutRow {
  payoutId: string;
  rewardId: string;
  userName: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  amount: number; // 실지급액(net)
  /** PENDING(아직 안 보냄) | FAILED(이체 실패, 재이체 대상) */
  status: string;
  failReason: string;
}

export interface GenerateResult {
  created: number;
  missingProfile: { userId: string; userName: string }[]; // 계좌정보 없어 제외된 학생
}

/**
 * 승인된 보상 → Payout(PENDING) 생성.
 * 계좌정보(PayrollProfile)가 없는 학생은 만들지 않고 목록으로 돌려줌(안내용).
 */
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
          // 예금주가 없으면 본인 이름을 씀
          holderName: p.holderName?.trim() || r.user.name,
          amount: r.netAmount,
          status: "PENDING",
        },
      });
      created++;
    } catch (e) {
      // 두 번 누른 경우 다른 요청이 먼저 만들었음(rewardId unique).
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return { created, missingProfile };
}

/**
 * 이체할 목록: 아직 보내지 않은 것(PENDING)과 재이체할 것(FAILED).
 * PROCESSING 은 지급대행 API 를 붙일 때 쓰는 상태라 지금은 쓰지 않음
 */
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

/**
 * 한 건의 이체를 마친 뒤 호출함. 멱등.
 * 원장에 PAYOUT_OUT·TAX_WITHHELD 를 쌓는 유일한 곳임. 재이체에 성공한 FAILED 건도 대상임
 */
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
    // 지급은 이미 커밋됐으므로 알림 실패는 무시함
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
    } catch {
      /* 무시: 지급은 확정됐음 */
    }
  }
  return done;
}

/**
 * 계좌 오류·예금주 불일치로 실패한 건.
 * 돈이 나가지 않았으므로 원장에는 쌓지 않고, Reward 를 FAILED 로 두어 미지급 부채로 남김
 * 이미 PAID 인 건은 바꾸지 않음
 */
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

  // 계좌 정보를 고치도록 학생에게 알림
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
    } catch {
      /* 무시: 실패 기록은 이미 확정됐음 */
    }
  }
  return done;
}

/**
 * 계좌를 고친 뒤 다시 이체 목록에 올림
 * FAILED 건은 이체가 일어나지 않았으므로 새 계좌로 Payout 을 갱신함(rewardId 가 unique 라 새로 만들 수 없음).
 */
export async function retryPayout(payoutId: string): Promise<boolean> {
  const p = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { reward: { include: { user: { include: { payrollProfile: true } } } } },
  });
  if (!p || p.status !== "FAILED") return false;

  const prof = p.reward.user.payrollProfile;
  if (!prof?.bankName || !digits(prof.accountNumber)) return false; // 계좌가 아직 없음

  return prisma.$transaction(async (tx) => {
    // 조회 뒤 지급 완료로 바뀌었으면 되돌리지 않음(되돌리면 원장에 기록된 건이 다시 이체 대상이 됨).
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

/** 모두 이체에 성공했을 때만 씀. PENDING 만 대상임 */
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
