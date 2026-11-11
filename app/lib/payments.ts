/**
 * 수납(무통장입금 + 세금계산서).
 *
 *   발주 확정 → Payment(PENDING) 생성, 기업에 계좌 안내
 *            → 기업이 입금
 *            → 관리자가 통장 확인 후 "입금 확인" → 원장에 PAYMENT_IN 기록
 *
 * 입금 확인은 조건부 업데이트(CAS)로 한 번만 반영함
 */

import { prisma } from "../db";
import * as ledger from "./ledger";
import * as popbill from "./popbill";
import { computeRefundAmount, computeRefundVat } from "./money";
import { backfillRewardsForOrder } from "./rewards";
import { getPlatformAccount } from "./orgSettings";

export interface ConfirmResult {
  /** 이번 호출에서 실제로 상태가 바뀌었는가. 이미 확인된 건이면 false */
  changed: boolean;
  orderId: string;
  /** 결제 전에 들어와 있던 응답에 대해 소급 생성한 보상 건수 */
  backfilledRewards?: number;
  /** 안전장치에 막혀 아무것도 하지 않은 경우의 사유. 있으면 changed 는 false 다. */
  blockedReason?: string;
}

/**
 * 입금 확인 → 원장 수납 기록 + 발주 확정(PAID). 멱등.
 * 청구액 전액이 들어왔다고 관리자가 판단했을 때 호출함(부분입금은 memo 로 처리).
 */
export async function confirmDeposit(
  paymentId: string,
  adminId: string,
  opts?: { depositorName?: string; memo?: string },
): Promise<ConfirmResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { vat: true } } },
  });
  if (!payment) throw new Error(`알 수 없는 결제입니다: ${paymentId}`);

  const changed = await prisma.$transaction(async (tx) => {
    // 아직 PAID 가 아닌 행만 갱신함. 0건이면 이미 확인된 것이라 원장에 쌓지 않음
    const swap = await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: new Date(),
        confirmedById: adminId,
        depositorName: opts?.depositorName ?? payment.depositorName,
        memo: opts?.memo ?? payment.memo,
      },
    });
    if (swap.count === 0) return false;

    await tx.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });

    await ledger.record(tx, {
      kind: "PAYMENT_IN",
      amount: payment.amount,
      orderId: payment.orderId,
      paymentId: payment.id,
      memo: `무통장입금 수납 (${opts?.depositorName ?? payment.depositorName ?? "?"})`,
    });

    // 수납액에 포함된 부가세는 부채로 쌓음(현금은 PAYMENT_IN 에 반영됨).
    if (payment.order.vat > 0) {
      await ledger.record(tx, {
        kind: "VAT_COLLECTED",
        amount: payment.order.vat,
        orderId: payment.orderId,
        paymentId: payment.id,
        memo: "수납액 중 부가세 (납부 대상)",
      });
    }

    return true;
  });

  // 입금 전에 들어온 응답에는 Reward 가 없으므로 여기서 소급 생성함
  // 수납 확정과는 별도로 트랜잭션 밖에서 하며, 멱등이라 다시 눌러 복구할 수 있음
  // 모집 알림은 승인 시점에 이미 나갔으므로 여기서 보내지 않음
  let backfilledRewards = 0;
  if (changed) {
    backfilledRewards = await backfillRewardsForOrder(payment.orderId);
  }

  return { changed, orderId: payment.orderId, backfilledRewards };
}

/**
 * 입금 확인 취소·발주 취소. 상태만 바꾸고 원장은 건드리지 않음
 * 환불 송금은 관리자가 따로 하므로 원장 기록은 confirmPaymentRefundSent 에서 함
 */
export async function cancelPayment(
  paymentId: string,
  reason: string,
): Promise<ConfirmResult> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error(`알 수 없는 결제입니다: ${paymentId}`);
  if (payment.status === "CANCELLED") {
    return { changed: false, orderId: payment.orderId };
  }

  // 이미 학생에게 지급한 건이 있으면 취소하지 않고 관리자가 판단하게 함
  const paidPayouts = await prisma.payout.count({
    where: { status: "PAID", reward: { orderId: payment.orderId } },
  });
  if (paidPayouts > 0) {
    return {
      changed: false,
      orderId: payment.orderId,
      blockedReason:
        `이미 평가자에게 지급된 보상이 ${paidPayouts}건 있어 취소할 수 없습니다. ` +
        `지급된 금액은 회수되지 않으므로, 전액 취소 대신 정산 마감으로 미달분만 환불하세요.`,
    };
  }

  const wasPaid = payment.status === "PAID";

  await prisma.$transaction(async (tx) => {
    const swap = await tx.payment.updateMany({
      where: { id: paymentId, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED", cancelledAt: new Date(), memo: reason },
    });
    if (swap.count === 0) return;

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: wasPaid ? "REFUNDED" : "CANCELLED" },
    });
  });

  return { changed: true, orderId: payment.orderId };
}

/**
 * 취소한 수납액을 기업에 돌려준 뒤 호출함. 멱등.
 * PAYMENT_REFUND 와 환불액에 포함된 부가세(VAT_REFUNDED)를 함께 기록함
 */
export async function confirmPaymentRefundSent(paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { vat: true } } },
  });
  if (!payment) return false;
  // 입금된 적 없는 건은 돌려줄 돈이 없음. paidAt 으로 판정함(status 는 이미 CANCELLED).
  if (!payment.paidAt || payment.refundSentAt) return false;

  return prisma.$transaction(async (tx) => {
    const swap = await tx.payment.updateMany({
      where: { id: paymentId, refundSentAt: null },
      data: { refundSentAt: new Date() },
    });
    if (swap.count === 0) return false;

    await ledger.record(tx, {
      kind: "PAYMENT_REFUND",
      amount: payment.amount,
      orderId: payment.orderId,
      paymentId: payment.id,
      memo: `수납 취소 환불 송금 (${payment.memo ?? ""})`,
    });
    if (payment.order.vat > 0) {
      await ledger.record(tx, {
        kind: "VAT_REFUNDED",
        amount: payment.order.vat,
        orderId: payment.orderId,
        paymentId: payment.id,
        memo: "환불분 부가세 (납부 의무 감소)",
      });
    }
    return true;
  });
}

export interface SyncResult {
  matched: number; // 자동 확인된 건수
  ambiguous: number; // 금액이 겹쳐 수동 확인이 필요한 건수
}

/**
 * 팝빌에서 입금내역을 받아 대기 중 발주와 금액으로 매칭함
 * 금액이 1:1 로 유일한 건만 자동 확정하고, 겹치는 건은 수동 확인으로 남김
 */
export async function syncDeposits(
  adminId: string,
  bankCode: string,
  accountNumber: string,
): Promise<SyncResult> {
  const pending = await prisma.payment.findMany({ where: { status: "PENDING" } });
  if (pending.length === 0) return { matched: 0, ambiguous: 0 };

  // 최근 8일 입금내역
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    })
      .format(d)
      .replace(/-/g, "");
  const edate = fmt(new Date());
  const sdate = fmt(new Date(Date.now() - 8 * 86400_000));

  const deposits = await popbill.listDeposits(bankCode, accountNumber, sdate, edate);

  // 금액별로 대기 발주와 입금 건수를 셈
  const payByAmount = new Map<number, typeof pending>();
  for (const p of pending) {
    const arr = payByAmount.get(p.amount) ?? [];
    arr.push(p);
    payByAmount.set(p.amount, arr);
  }

  let matched = 0;
  let ambiguous = 0;
  for (const [amount, pays] of payByAmount) {
    const deps = deposits.filter((d) => d.amount === amount);
    if (pays.length === 1 && deps.length >= 1) {
      // 1:1 매칭이면 자동 확정
      await confirmDeposit(pays[0].id, adminId, {
        depositorName: deps[0].remark,
        memo: `자동 매칭 (${deps[0].tradeDate})`,
      });
      await issueInvoiceForPayment(pays[0].id);
      matched++;
    } else if (deps.length >= 1) {
      ambiguous += pays.length; // 금액이 겹쳐 수동 확인 대상
    }
  }
  return { matched, ambiguous };
}

export interface SettleOrderResult {
  ok: boolean;
  reason?: string; // 마감 불가 사유
  approvedCount?: number;
  refund?: number; // 미달분 환불액
}

/**
 * 회차를 마감하고 미달분 환불액을 확정함. 멱등.
 *
 * 승인된 응답이 발주 인원보다 적으면 못 채운 몫(수수료·부가세 포함)을 환불함
 * 검수 대기가 0건이어야 마감할 수 있음
 * 금액만 확정하고, 원장 기록은 실제 송금 후 confirmOrderRefundSent 에서 함
 */
export async function settleOrderRefund(orderId: string): Promise<SettleOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { rewards: true, payments: true },
  });
  if (!order) return { ok: false, reason: "의뢰 없음" };
  if (order.status === "SETTLED") return { ok: false, reason: "이미 정산 마감됨" };
  if (order.status !== "PAID" && order.status !== "IN_PROGRESS") {
    return { ok: false, reason: "결제 완료된 의뢰만 마감할 수 있습니다." };
  }

  const pendingReview = order.rewards.filter((r) => r.status === "PENDING").length;
  if (pendingReview > 0) {
    return { ok: false, reason: `검수 대기 ${pendingReview}건이 남아 마감할 수 없습니다.` };
  }

  // FAILED(승인됐지만 이체 실패)도 이행분임. 아직 학생에게 줄 돈이므로 환불 대상에서 뺌
  const fulfilled = order.rewards.filter(
    (r) => r.status === "APPROVED" || r.status === "PAID" || r.status === "FAILED",
  );
  const approvedCount = fulfilled.length;
  // 개인별 보상액 조정이 있을 수 있어 인원이 아니라 금액 합계로 넘김
  const fulfilledSubtotal = fulfilled.reduce((sum, r) => sum + r.grossAmount, 0);
  const refund = computeRefundAmount(order, fulfilledSubtotal);

  await prisma.$transaction(async (tx) => {
    const swap = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PAID", "IN_PROGRESS"] } },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        // 금액만 확정함. 원장은 송금 시점(confirmOrderRefundSent)에 기록함
        refundAmount: refund,
      },
    });
    if (swap.count === 0) return; // 이미 마감됨
  });

  return { ok: true, approvedCount, refund };
}

/**
 * 마감 때 확정한 미달분 환불을 보낸 뒤 호출함. 멱등.
 * PAYMENT_REFUND 와 환불액에 포함된 부가세(VAT_REFUNDED)를 함께 기록함
 */
export async function confirmOrderRefundSent(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    // 환불 부가세분도 금액 기준으로 계산하므로 grossAmount 가 필요함
    include: { rewards: { select: { status: true, grossAmount: true } }, payments: true },
  });
  if (!order) return false;
  if (!order.refundAmount || order.refundAmount <= 0) return false;
  if (order.refundSentAt) return false;

  // settleOrderRefund 와 같은 기준으로 이행분을 계산해야 환불액과 부가세분이 맞음
  const fulfilledRewards = order.rewards.filter(
    (r) => r.status === "APPROVED" || r.status === "PAID" || r.status === "FAILED",
  );
  const fulfilledSubtotal = fulfilledRewards.reduce((sum, r) => sum + r.grossAmount, 0);
  const fulfilledCount = fulfilledRewards.length;
  const refundVat = computeRefundVat(order, fulfilledSubtotal);
  const paidPayment = order.payments.find((p) => p.status === "PAID");
  const refund = order.refundAmount;

  return prisma.$transaction(async (tx) => {
    const swap = await tx.order.updateMany({
      where: { id: orderId, refundSentAt: null },
      data: { refundSentAt: new Date() },
    });
    if (swap.count === 0) return false;

    await ledger.record(tx, {
      kind: "PAYMENT_REFUND",
      amount: refund,
      orderId,
      paymentId: paidPayment?.id,
      memo: `미달분 환불 송금 (${order.panelSize}명 중 ${fulfilledCount}명 이행)`,
    });
    if (refundVat > 0) {
      await ledger.record(tx, {
        kind: "VAT_REFUNDED",
        amount: refundVat,
        orderId,
        paymentId: paidPayment?.id,
        memo: "환불분 부가세 (납부 의무 감소)",
      });
    }
    return true;
  });
}

/**
 * 수정세금계산서가 필요한지(발행 후 환불이 나간 경우).
 * 수정 발행은 관리자가 팝빌·홈택스에서 직접 하고 markTaxInvoiceAmended 로 완료 처리함
 */
export function needsTaxInvoiceAmendment(
  payment: { taxInvoiceIssued: boolean; refundSentAt: Date | null; taxInvoiceAmendedAt: Date | null },
  order: { refundSentAt: Date | null },
): boolean {
  if (!payment.taxInvoiceIssued) return false;
  if (payment.taxInvoiceAmendedAt) return false;
  return Boolean(payment.refundSentAt || order.refundSentAt);
}

/** 수정세금계산서를 실제로 발행한 뒤 완료 처리. 멱등. */
export async function markTaxInvoiceAmended(paymentId: string): Promise<boolean> {
  const r = await prisma.payment.updateMany({
    where: { id: paymentId, taxInvoiceAmendedAt: null },
    data: { taxInvoiceAmendedAt: new Date() },
  });
  return r.count > 0;
}

/**
 * 세금계산서 발행(팝빌). DB 트랜잭션 밖에서 호출함. 멱등.
 *
 * 실패해도 수납은 유지되고 taxInvoiceError 에 사유가 남아 재시도할 수 있음
 * 팝빌이 설정되지 않았으면 발행 대기로 남김. mgtKey 가 팝빌 쪽 중복 발행을 막음
 */
export async function issueInvoiceForPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { service: true } } },
  });
  if (!payment) return;
  if (payment.taxInvoiceIssued) return; // 이미 발행됨

  const order = payment.order;

  // 발행에 필요한 기업 정보가 없으면 스킵 (발주 때 안 받았을 수 있음)
  if (!order.bizNo || !order.bizName) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { taxInvoiceError: "기업 사업자정보 누락: 세금계산서 발행 불가" },
    });
    return;
  }

  if (!popbill.isConfigured()) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { taxInvoiceError: "팝빌 미설정: 키 등록 후 재발행 필요" },
    });
    return;
  }

  // 관리번호(멱등키) = 발주번호. 이미 배정돼 있으면 재사용해 이중발행을 막음
  const mgtKey = payment.taxInvoiceMgtKey ?? payment.ref;

  // 입금 확인 전이면 청구, 후면 영수로 발행함
  const paid = Boolean(payment.paidAt);

  // 입금 계좌는 청구 건에만 비고로 실음
  let remark = "";
  if (!paid) {
    const acct = await getPlatformAccount();
    if (acct.account) {
      remark = `입금계좌 ${acct.bank} ${acct.account} (예금주 ${acct.holder}) · 입금 시 의뢰 번호 ${order.orderNo} 기재`;
    }
  }

  try {
    const result = await popbill.issueTaxInvoice({
      mgtKey,
      buyer: {
        corpNum: order.bizNo,
        corpName: order.bizName,
        ceoName: order.bizCeo,
        addr: order.bizAddr,
        email: order.bizEmail,
      },
      supplyCost: order.subtotal + order.fee, // 공급가액 = 보상 + 수수료 (부가세 제외)
      tax: order.vat,
      itemName: `${order.service.name} 평가 ${order.panelSize}명`,
      purposeType: paid ? "영수" : "청구",
      remark,
    });
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        taxInvoiceMgtKey: result.mgtKey,
        taxInvoiceNtsNum: result.ntsConfirmNum || null,
        taxInvoiceIssued: true,
        taxInvoiceError: null,
        // 보통 300(발행완료). 국세청 전송 결과는 syncTaxInvoiceStates() 가 나중에 채움
        taxInvoiceNtsState: result.stateCode,
        taxInvoiceNtsCheckedAt: new Date(),
      },
    });
  } catch (e) {
    // 재시도 때 같은 mgtKey 를 쓰도록 저장함
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        taxInvoiceMgtKey: mgtKey,
        taxInvoiceError: e instanceof Error ? e.message : "세금계산서 발행 실패",
      },
    });
  }
}

export interface InvoiceStateSyncResult {
  checked: number; // 조회한 건수
  updated: number; // 상태가 바뀐 건수
  failed: number; // 국세청 전송실패(305)로 확인된 누적 건수
  errors: number; // 조회 자체가 실패한 건수
}

/** 전송 결과가 늦어도 이 기간을 넘기면 자동 추적을 멈춤(수동 확인 대상). */
const NTS_SYNC_WINDOW_DAYS = 30;

/**
 * 크론. 세금계산서의 국세청 전송 결과(304 성공 / 305 실패)를 팝빌에서 조회해 반영함
 *
 * 팝빌은 국세청 전송을 비동기로 처리하므로 발행 후 따로 확인해야 함
 * 건수가 적어 웹훅 대신 하루 한 번 조회함
 * 대상: 발행됐고 최종 상태(304·600)가 아닌 최근 30일 건. 팝빌 미설정이면 건너뜀
 */
export async function syncTaxInvoiceStates(): Promise<InvoiceStateSyncResult> {
  const empty: InvoiceStateSyncResult = { checked: 0, updated: 0, failed: 0, errors: 0 };
  if (!popbill.isConfigured()) return empty;

  const since = new Date(Date.now() - NTS_SYNC_WINDOW_DAYS * 86400_000);
  const targets = await prisma.payment.findMany({
    where: {
      taxInvoiceIssued: true,
      taxInvoiceMgtKey: { not: null },
      createdAt: { gte: since },
      // 304(전송성공)·600(발행취소)은 더 볼 필요가 없음. NULL 은 아직 미확인이라 포함해야 함
      OR: [
        { taxInvoiceNtsState: null },
        { taxInvoiceNtsState: { notIn: [popbill.NTS_STATE.SENT, popbill.NTS_STATE.CANCELLED] } },
      ],
    },
    select: { id: true, taxInvoiceMgtKey: true, taxInvoiceNtsState: true },
  });

  const result = { ...empty };
  for (const p of targets) {
    result.checked++;
    try {
      const state = await popbill.getTaxInvoiceState(p.taxInvoiceMgtKey!);
      if (state.stateCode !== p.taxInvoiceNtsState) result.updated++;
      if (state.stateCode === popbill.NTS_STATE.SEND_FAILED) result.failed++;

      await prisma.payment.update({
        where: { id: p.id },
        data: {
          taxInvoiceNtsState: state.stateCode,
          taxInvoiceNtsCheckedAt: new Date(),
          // 승인번호는 발행 시점에 이미 받지만, 비어 있었다면 여기서 채움
          ...(state.ntsConfirmNum ? { taxInvoiceNtsNum: state.ntsConfirmNum } : {}),
        },
      });
    } catch {
      // 한 건이 실패해도 나머지는 계속 확인함. 조회 실패는 상태를 덮어쓰지 않음
      result.errors++;
    }
  }
  return result;
}
