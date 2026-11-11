"use server";

import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../../db";
import {
  reviewReward,
  generatePayouts,
  confirmPayoutPaid,
  confirmPayoutsPaid,
  markPayoutFailed,
  retryPayout,
  setIncomeType,
  adjustRewardAmount,
} from "../../lib/rewards";
import { settleOrderRefund, confirmOrderRefundSent } from "../../lib/payments";
import { recordRemittance, recordVatInput } from "../../lib/ledger";
import type { IncomeType } from "../../lib/withholding";
import { isFilingKind } from "../../lib/taxFiling";

const PATH = "/dashboard/settlement";

async function requireAdmin() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return null;
  return me;
}

/** 기타소득/사업소득 */
export async function setIncomeTypeAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const v = (formData.get("incomeType") as string) === "BUSINESS" ? "BUSINESS" : "OTHER";
  await setIncomeType(v as IncomeType);
  revalidatePath(PATH);
}

/**
 * 참여 시간이 다른 사람의 보상액을 개인별로 바꿈(adjustRewardAmount).
 * 지급 전(PENDING)만 바뀌고, 0건이면 이미 검수된 건이라 그 사실을 알림
 */
export async function adjustRewardAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) redirect(`${PATH}?error=권한이 없습니다.`);

  const rewardId = String(formData.get("rewardId") ?? "").trim();
  const raw = String(formData.get("grossAmount") ?? "").replace(/[^0-9]/g, "");
  const amount = Number.parseInt(raw, 10);
  const reason = String(formData.get("adjustReason") ?? "");

  if (!rewardId) redirect(`${PATH}?error=대상을 찾을 수 없습니다.`);
  if (!Number.isInteger(amount) || amount < 0) {
    redirect(`${PATH}?error=금액이 올바르지 않습니다.`);
  }
  // 입력 실수를 막는 상한(발주 폼과 같은 1인 100만원)
  if (amount > 1_000_000) redirect(`${PATH}?error=1인 보상은 100만원을 넘을 수 없습니다.`);

  const n = await adjustRewardAmount(rewardId, me.id, amount, reason);
  revalidatePath(PATH);
  if (n === 0) redirect(`${PATH}?error=이미 검수·지급된 건은 금액을 바꿀 수 없습니다.`);
  redirect(PATH);
}

/** 승인/반려 */
export async function reviewRewardAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const rewardId = ((formData.get("rewardId") as string) || "").trim();
  const approve = (formData.get("approve") as string) === "1";
  const reason = ((formData.get("reason") as string) || "").trim();
  if (!rewardId) return;
  await reviewReward(rewardId, me.id, approve, reason);
  revalidatePath(PATH);
  redirect(PATH);
}

/** 승인분 → Payout 생성 */
export async function generatePayoutsAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const orderId = ((formData.get("orderId") as string) || "").trim();
  if (!orderId) return;
  const r = await generatePayouts(orderId);
  revalidatePath(PATH);
  const miss = r.missingProfile.length;
  redirect(`${PATH}?created=${r.created}${miss ? `&missing=${miss}` : ""}`);
}

/** 한 건의 이체를 마친 뒤 누름(기본 경로). */
export async function confirmPayoutAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const payoutId = ((formData.get("payoutId") as string) || "").trim();
  if (!payoutId) return;
  const ok = await confirmPayoutPaid(payoutId);
  revalidatePath(PATH);
  redirect(`${PATH}?paid=${ok ? 1 : 0}`);
}

/** 계좌 오류·예금주 불일치. 원장에는 기록하지 않음 */
export async function failPayoutAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const payoutId = ((formData.get("payoutId") as string) || "").trim();
  const reason = ((formData.get("reason") as string) || "").trim();
  if (!payoutId) return;
  await markPayoutFailed(payoutId, reason);
  revalidatePath(PATH);
  redirect(`${PATH}?failed=1`);
}

/** 계좌를 고친 뒤 다시 이체 목록에 올림 */
export async function retryPayoutAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const payoutId = ((formData.get("payoutId") as string) || "").trim();
  if (!payoutId) return;
  const ok = await retryPayout(payoutId);
  revalidatePath(PATH);
  if (!ok) {
    redirect(`${PATH}?error=${encodeURIComponent("계좌 정보가 아직 없거나 고쳐지지 않았습니다.")}`);
  }
  redirect(`${PATH}?retried=1`);
}

/** 모든 이체가 성공했을 때만 씀. 원장에 기록함 */
export async function confirmPayoutsAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const orderId = ((formData.get("orderId") as string) || "").trim();
  if (!orderId) return;
  const paid = await confirmPayoutsPaid(orderId);
  revalidatePath(PATH);
  redirect(`${PATH}?paid=${paid}`);
}

/** 원천세·부가세를 납부한 뒤 금액을 원장에 기록함 */
export async function recordRemittanceAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const kind = (formData.get("kind") as string) || "TAX";
  const amount = Number.parseInt(((formData.get("amount") as string) || "").replace(/[^0-9]/g, ""), 10);
  const memo = ((formData.get("memo") as string) || "").trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect(`${PATH}?tab=filing&error=${encodeURIComponent("금액을 숫자로 입력하세요.")}`);
  }

  // 매입세액은 공제라 현금은 움직이지 않고 납부할 부가세만 줄어듦
  if (kind === "VAT_INPUT") {
    await recordVatInput(amount, memo || "운영비 매입세액");
  } else {
    const remitKind = kind === "VAT" ? "VAT_REMITTED" : "TAX_REMITTED";
    await recordRemittance(
      remitKind,
      amount,
      memo || (remitKind === "VAT_REMITTED" ? "부가세 납부" : "원천세 납부"),
    );
  }
  revalidatePath(PATH);
  redirect(`${PATH}?tab=filing&remitted=1`);
}

/** 마감 때 확정한 미달분을 보낸 뒤 원장에 기록함 */
export async function confirmOrderRefundSentAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const orderId = ((formData.get("orderId") as string) || "").trim();
  if (!orderId) return;
  const ok = await confirmOrderRefundSent(orderId);
  revalidatePath(PATH);
  if (!ok) redirect(`${PATH}?error=${encodeURIComponent("환불 대상이 아니거나 이미 처리됐습니다.")}`);
  redirect(`${PATH}?refundSent=1`);
}

/** 미달분 환불액을 확정하고 마감함(원장은 송금 확인 때 기록). */
export async function settleOrderAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const orderId = ((formData.get("orderId") as string) || "").trim();
  if (!orderId) return;
  const r = await settleOrderRefund(orderId);
  revalidatePath(PATH);
  if (!r.ok) redirect(`${PATH}?error=${encodeURIComponent(r.reason ?? "마감 실패")}`);
  redirect(`${PATH}?settled=1&refund=${r.refund ?? 0}`);
}

// 수정신고가 있으므로 기록한 금액은 고칠 수 있음(app/lib/taxFiling.ts).

/** 없으면 만들고, 있으면 고침. 값은 폼에서 온 것을 그대로 씀 */
export async function recordTaxFilingAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) redirect(`${PATH}?tab=filing&error=권한이 없습니다.`);

  const kind = String(formData.get("kind") ?? "");
  const year = Number.parseInt(String(formData.get("year") ?? ""), 10);
  const month = Number.parseInt(String(formData.get("month") ?? ""), 10);
  if (!isFilingKind(kind)) redirect(`${PATH}?tab=filing&error=신고 종류가 올바르지 않습니다.`);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    redirect(`${PATH}?tab=filing&error=신고 연월이 올바르지 않습니다.`);
  }

  const int = (k: string) => {
    const v = Number.parseInt(String(formData.get(k) ?? "").replace(/[^0-9-]/g, ""), 10);
    return Number.isInteger(v) && v >= 0 ? v : 0;
  };
  const status = String(formData.get("status") ?? "FILED") === "NOT_REQUIRED"
    ? "NOT_REQUIRED"
    : "FILED";
  const receiptNo = String(formData.get("receiptNo") ?? "").trim().slice(0, 60) || null;
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 300) || null;

  const data = {
    status,
    headcount: int("headcount"),
    entryCount: int("entryCount"),
    grossAmount: int("grossAmount"),
    incomeTax: int("incomeTax"),
    localTax: int("localTax"),
    receiptNo,
    memo,
  };

  const existing = await prisma.taxFiling.findUnique({
    where: { kind_year_month: { kind, year, month } },
    select: { id: true },
  });

  if (existing) {
    // 기존 기록을 다시 저장하면 수정한 것으로 기록함
    await prisma.taxFiling.update({
      where: { id: existing.id },
      data: { ...data, amendedAt: new Date(), amendedById: me.id },
    });
  } else {
    await prisma.taxFiling.create({
      data: { ...data, kind, year, month, filedById: me.id },
    });
  }

  revalidatePath(PATH);
  redirect(`${PATH}?tab=filing`);
}

/** 잘못 기록한 경우. 삭제하면 리마인더가 다시 옴 */
export async function deleteTaxFilingAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) redirect(`${PATH}?tab=filing&error=권한이 없습니다.`);

  const id = String(formData.get("filingId") ?? "");
  if (!id) redirect(`${PATH}?tab=filing&error=대상을 찾을 수 없습니다.`);

  await prisma.taxFiling.delete({ where: { id } }).catch(() => null);
  revalidatePath(PATH);
  redirect(`${PATH}?tab=filing`);
}
