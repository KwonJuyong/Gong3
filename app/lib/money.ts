// 금액은 정수(원), 비율은 bp(1000 bp = 10%), 나눗셈은 절사
export const VAT_RATE_BP = 1000;
export const DEFAULT_FEE_RATE_BP = 2000;

export function applyBp(amount: number, rateBp: number): number {
  return Math.floor((amount * rateBp) / 10000);
}

export interface OrderAmounts {
  subtotal: number;
  fee: number;
  vat: number;
  totalAmount: number;
}

export function computeOrderAmounts(
  panelSize: number,
  rewardPerPerson: number,
  feeRateBp: number = DEFAULT_FEE_RATE_BP,
): OrderAmounts {
  return computeAmountsFromSubtotal(panelSize * rewardPerPerson, feeRateBp);
}

export function computeAmountsFromSubtotal(
  subtotal: number,
  feeRateBp: number = DEFAULT_FEE_RATE_BP,
): OrderAmounts {
  const fee = applyBp(subtotal, feeRateBp);
  const vat = applyBp(subtotal + fee, VAT_RATE_BP);
  return { subtotal, fee, vat, totalAmount: subtotal + fee + vat };
}

export interface RefundableOrder {
  subtotal: number;
  feeRateBp: number;
  totalAmount: number;
}

// 총액에서 실제 이행분 총액을 빼서 절사 오차를 방지
export function computeRefundAmount(order: RefundableOrder, fulfilledSubtotal: number): number {
  const done = Math.max(0, Math.floor(fulfilledSubtotal));
  if (done >= order.subtotal) return 0;
  if (done <= 0) return order.totalAmount;

  const fulfilled = computeAmountsFromSubtotal(done, order.feeRateBp);
  return order.totalAmount - fulfilled.totalAmount;
}

export function computeRefundVat(
  order: RefundableOrder & { vat: number },
  fulfilledSubtotal: number,
): number {
  const done = Math.max(0, Math.floor(fulfilledSubtotal));
  if (done >= order.subtotal) return 0;
  if (done <= 0) return order.vat;

  const fulfilled = computeAmountsFromSubtotal(done, order.feeRateBp);
  return order.vat - fulfilled.vat;
}

export function formatOrderNo(seq: number, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const ymd = `${get("year")}${get("month")}${get("day")}`;
  return `ORD-${ymd}-${String(seq).padStart(4, "0")}`;
}

export function won(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

export function wonText(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function manwonText(n: number): string {
  if (n < 10000) return wonText(n);
  return Math.floor(n / 10000).toLocaleString("ko-KR") + "만 원";
}

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"];
const BIG_UNITS = ["", "만", "억", "조", "경"];

export function koreanNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  const v = Math.floor(Math.abs(n));
  if (v === 0) return "영";

  const groups: number[] = [];
  let rest = v;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }

  let out = "";
  for (let g = groups.length - 1; g >= 0; g--) {
    const group = groups[g];
    if (group === 0) continue;

    let part = "";
    for (let p = 3; p >= 0; p--) {
      const digit = Math.floor(group / Math.pow(10, p)) % 10;
      if (digit === 0) continue;
      part += (digit === 1 && p > 0 ? "" : DIGITS[digit]) + SMALL_UNITS[p];
    }
    out += part + BIG_UNITS[g];
  }
  return (n < 0 ? "마이너스 " : "") + out;
}

export function wonInKorean(n: number): string {
  return `일금 ${koreanNumber(n)}원정`;
}
