/**
 * 마켓플레이스 자금 원장(LedgerEntry). 금액 집계는 상태 필드가 아니라 이 원장으로 함
 *
 * 1. append-only: 행을 수정·삭제하지 않고, 취소·환불은 반대 방향 행을 새로 쌓음
 * 2. amount 는 부호 있는 현금 증감이라 SUM(amount) 가 통장 잔액임
 *    원천징수·부가세처럼 받아 두었다가 내야 하는 돈은 liability 에 따로 쌓음
 *    쓸 수 있는 돈 = 현금 − 부채.
 * 3. 원장 기록은 상태 변경과 같은 트랜잭션에서 함(모든 함수가 tx 를 받음).
 */

import { Prisma } from "@prisma/client";
// ../db 는 next/headers 까지 끌어와 Next 밖에서 도는 시드 스크립트가 로드하지 못하므로 ../prisma 를 씀
import { prisma } from "../prisma";

/** 트랜잭션 클라이언트 (prisma.$transaction 콜백이 넘겨주는 것) */
export type Tx = Prisma.TransactionClient;

/**
 * 원장 항목 종류. 괄호는 현금 방향.
 * 원천징수는 지급 때 적립(TAX_WITHHELD, 현금 변동 없음)하고 납부 때 현금이 나감(TAX_REMITTED).
 */
export type LedgerKind =
  | "PAYMENT_IN" // (+) 기업 결제 수납 (부가세 포함 전액)
  | "PAYMENT_REFUND" // (−) 환불. 실제 송금 시점에 기록
  | "PAYOUT_OUT" // (−) 평가단 실지급 (netAmount 만)
  | "TAX_WITHHELD" // 부채(+) 원천징수 적립, 현금 이동 없음
  | "TAX_REMITTED" // (−) 원천세 납부 · 부채(−)
  | "VAT_COLLECTED" // 부채(+) 수납액에 포함된 부가세(현금은 PAYMENT_IN 에 포함)
  | "VAT_REFUNDED" // 부채(−) 환불로 되돌려준 부가세분
  | "VAT_INPUT" // 부채(−) 운영비 매입세액, 납부할 부가세에서 공제
  | "VAT_REMITTED"; // (−) 부가세 납부 · 부채(−)

interface RecordArgs {
  kind: LedgerKind;
  /** 부호 없는 크기. 방향은 kind 가 정함 */
  amount: number;
  orderId?: string;
  paymentId?: string;
  payoutId?: string;
  memo?: string;
}

/** kind 별 현금 방향. 0 이면 통장 잔액이 변하지 않음 */
const CASH: Record<LedgerKind, 1 | 0 | -1> = {
  PAYMENT_IN: 1,
  PAYMENT_REFUND: -1,
  PAYOUT_OUT: -1,
  TAX_WITHHELD: 0,
  TAX_REMITTED: -1,
  VAT_COLLECTED: 0,
  VAT_REFUNDED: 0,
  // 운영비 결제 현금은 이 원장 범위 밖이고, 납부할 부가세가 줄어드는 것만 기록함
  VAT_INPUT: 0,
  VAT_REMITTED: -1,
};

/** kind 별 부채 방향. 납부(REMITTED)는 현금과 부채가 함께 줄어듦 */
const LIABILITY: Record<LedgerKind, 1 | 0 | -1> = {
  PAYMENT_IN: 0,
  PAYMENT_REFUND: 0,
  PAYOUT_OUT: 0,
  TAX_WITHHELD: 1,
  TAX_REMITTED: -1,
  VAT_COLLECTED: 1,
  VAT_REFUNDED: -1,
  VAT_INPUT: -1,
  VAT_REMITTED: -1,
};

const TAX_KINDS: LedgerKind[] = ["TAX_WITHHELD", "TAX_REMITTED"];
const VAT_KINDS: LedgerKind[] = [
  "VAT_COLLECTED",
  "VAT_REFUNDED",
  "VAT_INPUT",
  "VAT_REMITTED",
];

/**
 * 원장에 한 줄 쌓음. 상태 변경과 같은 트랜잭션 안에서 호출함
 * amount 는 양수로 넘기고 방향은 kind 가 정함
 */
export async function record(tx: Tx, args: RecordArgs) {
  const magnitude = Math.abs(Math.round(args.amount));
  return tx.ledgerEntry.create({
    data: {
      kind: args.kind,
      amount: magnitude * CASH[args.kind],
      liability: magnitude * LIABILITY[args.kind],
      orderId: args.orderId ?? null,
      paymentId: args.paymentId ?? null,
      payoutId: args.payoutId ?? null,
      memo: args.memo ?? "",
    },
  });
}

/** 지급 1건 기록: 실지급(PAYOUT_OUT)과 원천징수 적립(TAX_WITHHELD)을 함께 쌓음 */
export async function recordPayout(
  tx: Tx,
  args: { payoutId: string; orderId: string; netAmount: number; taxAmount: number; memo?: string },
) {
  await record(tx, {
    kind: "PAYOUT_OUT",
    amount: args.netAmount,
    payoutId: args.payoutId,
    orderId: args.orderId,
    memo: args.memo ?? "",
  });
  if (args.taxAmount > 0) {
    await record(tx, {
      kind: "TAX_WITHHELD",
      amount: args.taxAmount,
      payoutId: args.payoutId,
      orderId: args.orderId,
      memo: "원천징수 적립",
    });
  }
}


/** 플랫폼 현금 잔액 = SUM(amount). 실제 통장 잔액과 대사하는 값임 */
export async function cashBalance(): Promise<number> {
  const r = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export interface LedgerSummary {
  paymentIn: number; // 누적 수납 (부가세 포함)
  refunded: number; // 누적 환불 (실제 송금분만)
  paidOut: number; // 누적 실지급 (세후)
  taxPayable: number; // 미납 원천세 = 적립 − 납부
  vatPayable: number; // 미납 부가세 = 수취 − 환불 − 납부
  cash: number; // 통장 잔액 = SUM(amount)
  /** 쓸 수 있는 돈 = cash − (미납 원천세 + 미납 부가세) */
  available: number;
}

/** kind 별 합계를 한 번에: 대시보드용 */
export async function summary(): Promise<LedgerSummary> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["kind"],
    _sum: { amount: true, liability: true },
  });
  const cashOf = (k: LedgerKind) => Math.abs(rows.find((r) => r.kind === k)?._sum.amount ?? 0);
  const liabilityOver = (kinds: LedgerKind[]) =>
    rows
      .filter((r) => kinds.includes(r.kind as LedgerKind))
      .reduce((s, r) => s + (r._sum.liability ?? 0), 0);

  const taxPayable = liabilityOver(TAX_KINDS);
  const vatPayable = liabilityOver(VAT_KINDS);
  const cash = rows.reduce((s, r) => s + (r._sum.amount ?? 0), 0);

  return {
    paymentIn: cashOf("PAYMENT_IN"),
    refunded: cashOf("PAYMENT_REFUND"),
    paidOut: cashOf("PAYOUT_OUT"),
    taxPayable,
    vatPayable,
    cash,
    available: cash - taxPayable - vatPayable,
  };
}

/** 원천세·부가세를 납부한 뒤 호출함. 현금과 부채가 함께 줄어듦 */
export async function recordRemittance(
  kind: "TAX_REMITTED" | "VAT_REMITTED",
  amount: number,
  memo: string,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await record(tx, { kind, amount, memo });
  });
}

/**
 * 운영비 세금계산서의 세액을 기록함(부가세 납부액 = 매출세액 − 매입세액).
 * 운영비 지출 현금은 이 원장 범위 밖이라 현금은 움직이지 않음
 */
export async function recordVatInput(amount: number, memo: string): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await record(tx, { kind: "VAT_INPUT", amount, memo });
  });
}


export interface LedgerRow {
  id: string;
  kind: string;
  amount: number;
  liability: number;
  memo: string;
  occurredAt: Date;
  orderNo: string;
  /** 이 줄까지의 누적 잔액(통장 대사용) */
  balance: number;
}

/**
 * 최근 원장 내역(최신순)과 각 줄 시점의 누적 잔액.
 * 보이는 N건만 더하면 이전 이력이 빠지므로 전체 합계에서 거꾸로 빼며 계산함
 */
export async function recentEntries(limit = 50): Promise<LedgerRow[]> {
  const rows = await prisma.ledgerEntry.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { order: { select: { orderNo: true } } },
  });

  let running = await cashBalance();
  return rows.map((r) => {
    const balance = running;
    running -= r.amount; // 한 줄 위(= 더 과거)의 잔액
    return {
      id: r.id,
      kind: r.kind,
      amount: r.amount,
      liability: r.liability,
      memo: r.memo,
      occurredAt: r.occurredAt,
      orderNo: r.order?.orderNo ?? "",
      balance,
    };
  });
}

/**
 * 결제받았지만 아직 지급·환불하지 않은 금액(평가단에 대한 미지급 부채).
 * 현금 잔액이 이보다 작으면 지급할 수 없으므로 대시보드에 같이 보여줌
 */
export async function unsettledLiability(): Promise<number> {
  const r = await prisma.reward.aggregate({
    where: { status: { in: ["PENDING", "APPROVED", "FAILED"] } },
    _sum: { netAmount: true },
  });
  return r._sum.netAmount ?? 0;
}
