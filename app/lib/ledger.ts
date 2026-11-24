import { Prisma } from "@prisma/client";
// 시드 스크립트에서도 로드되므로 next/headers 의존이 없는 ../prisma 사용
import { prisma } from "../prisma";

export type Tx = Prisma.TransactionClient;

export type LedgerKind =
  | "PAYMENT_IN"
  | "PAYMENT_REFUND"
  | "PAYOUT_OUT"
  | "TAX_WITHHELD"
  | "TAX_REMITTED"
  | "VAT_COLLECTED"
  | "VAT_REFUNDED"
  | "VAT_INPUT"
  | "VAT_REMITTED";

interface RecordArgs {
  kind: LedgerKind;
  amount: number;
  orderId?: string;
  paymentId?: string;
  payoutId?: string;
  memo?: string;
}

const CASH: Record<LedgerKind, 1 | 0 | -1> = {
  PAYMENT_IN: 1,
  PAYMENT_REFUND: -1,
  PAYOUT_OUT: -1,
  TAX_WITHHELD: 0,
  TAX_REMITTED: -1,
  VAT_COLLECTED: 0,
  VAT_REFUNDED: 0,
  VAT_INPUT: 0,
  VAT_REMITTED: -1,
};

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

// append-only 원장 기록(amount는 양수, 부호는 kind별 CASH/LIABILITY가 결정)
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

export async function cashBalance(): Promise<number> {
  const r = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

export interface LedgerSummary {
  paymentIn: number;
  refunded: number;
  paidOut: number;
  taxPayable: number;
  vatPayable: number;
  cash: number;
  available: number;
}

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
  balance: number;
}

export async function recentEntries(limit = 50): Promise<LedgerRow[]> {
  const rows = await prisma.ledgerEntry.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { order: { select: { orderNo: true } } },
  });

  let running = await cashBalance();
  return rows.map((r) => {
    const balance = running;
    running -= r.amount;
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

export async function unsettledLiability(): Promise<number> {
  const r = await prisma.reward.aggregate({
    where: { status: { in: ["PENDING", "APPROVED", "FAILED"] } },
    _sum: { netAmount: true },
  });
  return r._sum.netAmount ?? 0;
}
