import { prisma } from "../db";
import * as ledger from "./ledger";
import * as popbill from "./popbill";
import { computeRefundAmount, computeRefundVat } from "./money";
import { backfillRewardsForOrder } from "./rewards";
import { getPlatformAccount } from "./orgSettings";

export interface ConfirmResult {
  changed: boolean;
  orderId: string;
  backfilledRewards?: number;
  blockedReason?: string;
}

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

  let backfilledRewards = 0;
  if (changed) {
    backfilledRewards = await backfillRewardsForOrder(payment.orderId);
  }

  return { changed, orderId: payment.orderId, backfilledRewards };
}

export async function cancelPayment(
  paymentId: string,
  reason: string,
): Promise<ConfirmResult> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error(`알 수 없는 결제입니다: ${paymentId}`);
  if (payment.status === "CANCELLED") {
    return { changed: false, orderId: payment.orderId };
  }

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

export async function confirmPaymentRefundSent(paymentId: string): Promise<boolean> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { vat: true } } },
  });
  if (!payment) return false;
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
  matched: number;
  ambiguous: number;
}

export async function syncDeposits(
  adminId: string,
  bankCode: string,
  accountNumber: string,
): Promise<SyncResult> {
  const pending = await prisma.payment.findMany({ where: { status: "PENDING" } });
  if (pending.length === 0) return { matched: 0, ambiguous: 0 };

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
      await confirmDeposit(pays[0].id, adminId, {
        depositorName: deps[0].remark,
        memo: `자동 매칭 (${deps[0].tradeDate})`,
      });
      await issueInvoiceForPayment(pays[0].id);
      matched++;
    } else if (deps.length >= 1) {
      ambiguous += pays.length;
    }
  }
  return { matched, ambiguous };
}

export interface SettleOrderResult {
  ok: boolean;
  reason?: string;
  approvedCount?: number;
  refund?: number;
}

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

  const fulfilled = order.rewards.filter(
    (r) => r.status === "APPROVED" || r.status === "PAID" || r.status === "FAILED",
  );
  const approvedCount = fulfilled.length;
  const fulfilledSubtotal = fulfilled.reduce((sum, r) => sum + r.grossAmount, 0);
  const refund = computeRefundAmount(order, fulfilledSubtotal);

  await prisma.$transaction(async (tx) => {
    const swap = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PAID", "IN_PROGRESS"] } },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        refundAmount: refund,
      },
    });
    if (swap.count === 0) return;
  });

  return { ok: true, approvedCount, refund };
}

export async function confirmOrderRefundSent(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { rewards: { select: { status: true, grossAmount: true } }, payments: true },
  });
  if (!order) return false;
  if (!order.refundAmount || order.refundAmount <= 0) return false;
  if (order.refundSentAt) return false;

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

export function needsTaxInvoiceAmendment(
  payment: { taxInvoiceIssued: boolean; refundSentAt: Date | null; taxInvoiceAmendedAt: Date | null },
  order: { refundSentAt: Date | null },
): boolean {
  if (!payment.taxInvoiceIssued) return false;
  if (payment.taxInvoiceAmendedAt) return false;
  return Boolean(payment.refundSentAt || order.refundSentAt);
}

export async function markTaxInvoiceAmended(paymentId: string): Promise<boolean> {
  const r = await prisma.payment.updateMany({
    where: { id: paymentId, taxInvoiceAmendedAt: null },
    data: { taxInvoiceAmendedAt: new Date() },
  });
  return r.count > 0;
}

export async function issueInvoiceForPayment(paymentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { service: true } } },
  });
  if (!payment) return;
  if (payment.taxInvoiceIssued) return;

  const order = payment.order;

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

  const mgtKey = payment.taxInvoiceMgtKey ?? payment.ref;
  const paid = Boolean(payment.paidAt);

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
      supplyCost: order.subtotal + order.fee,
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
        taxInvoiceNtsState: result.stateCode,
        taxInvoiceNtsCheckedAt: new Date(),
      },
    });
  } catch (e) {
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
  checked: number;
  updated: number;
  failed: number;
  errors: number;
}

const NTS_SYNC_WINDOW_DAYS = 30;

export async function syncTaxInvoiceStates(): Promise<InvoiceStateSyncResult> {
  const empty: InvoiceStateSyncResult = { checked: 0, updated: 0, failed: 0, errors: 0 };
  if (!popbill.isConfigured()) return empty;

  const since = new Date(Date.now() - NTS_SYNC_WINDOW_DAYS * 86400_000);
  const targets = await prisma.payment.findMany({
    where: {
      taxInvoiceIssued: true,
      taxInvoiceMgtKey: { not: null },
      createdAt: { gte: since },
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
          ...(state.ntsConfirmNum ? { taxInvoiceNtsNum: state.ntsConfirmNum } : {}),
        },
      });
    } catch {
      result.errors++;
    }
  }
  return result;
}
