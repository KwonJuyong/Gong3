/**
 * 마켓플레이스 정산 금액 계산. 노무비(LaborClaim) 계산과는 별개다.
 *
 * - 금액은 정수(원)로만 다룬다.
 * - 비율은 bp(1/100 %) 단위다. 1000 bp = 10%.
 * - 나눗셈 결과는 절사(floor)한다.
 */

/** 부가세율 (10%) */
export const VAT_RATE_BP = 1000;

/** 플랫폼 수수료 기본값 (20%) */
export const DEFAULT_FEE_RATE_BP = 2000;

// 원천징수 계산은 과세최저한 등이 있어 withholding.ts 에 있다.

/** bp 비율 적용 후 원 단위 절사 */
export function applyBp(amount: number, rateBp: number): number {
  return Math.floor((amount * rateBp) / 10000);
}

export interface OrderAmounts {
  subtotal: number; // 평가단 보상 총액 (세전)
  fee: number; // 플랫폼 수수료
  vat: number; // 부가세
  totalAmount: number; // 기업이 결제할 금액
}

/**
 * 발주 금액 계산.
 * 플랫폼이 용역을 직접 공급하는 구조(총액법)라 부가세를 보상 + 수수료 전체에 부과한다.
 */
export function computeOrderAmounts(
  panelSize: number,
  rewardPerPerson: number,
  feeRateBp: number = DEFAULT_FEE_RATE_BP,
): OrderAmounts {
  return computeAmountsFromSubtotal(panelSize * rewardPerPerson, feeRateBp);
}

/**
 * 보상 소계로부터 수수료·부가세를 계산한다(여러 항목의 견적서용).
 * 견적서와 발주가 같은 식을 쓰도록 수수료·부가세 규칙은 여기에만 둔다.
 */
export function computeAmountsFromSubtotal(
  subtotal: number,
  feeRateBp: number = DEFAULT_FEE_RATE_BP,
): OrderAmounts {
  const fee = applyBp(subtotal, feeRateBp);
  const vat = applyBp(subtotal + fee, VAT_RATE_BP);
  return { subtotal, fee, vat, totalAmount: subtotal + fee + vat };
}

/** computeRefundAmount 가 필요로 하는 주문 필드 (Order 모델의 부분집합) */
export interface RefundableOrder {
  subtotal: number;
  feeRateBp: number;
  totalAmount: number;
}

/**
 * 미달·검수탈락분 환불액. 이행하지 않은 몫의 보상에 수수료·부가세까지 포함해 돌려준다.
 *
 * 절사가 두 번 들어가 합이 어긋나지 않도록 총액에서 이행분 총액을 빼서 구한다.
 * fulfilledSubtotal 은 실제 이행 보상 합계(Σ Reward.grossAmount)다. 개인별 보상액 조정이
 * 있을 수 있어 인원 × 단가로 계산하지 않는다.
 */
export function computeRefundAmount(order: RefundableOrder, fulfilledSubtotal: number): number {
  const done = Math.max(0, Math.floor(fulfilledSubtotal));
  // 개인 조정으로 이행분이 소계를 넘으면 환불은 0 이다(초과분은 플랫폼 부담).
  if (done >= order.subtotal) return 0;
  if (done <= 0) return order.totalAmount;

  const fulfilled = computeAmountsFromSubtotal(done, order.feeRateBp);
  return order.totalAmount - fulfilled.totalAmount;
}

/**
 * 환불액 중 부가세분(원장의 VAT_REFUNDED 로 기록).
 * computeRefundAmount 와 같은 방식으로 총 부가세 − 이행분 부가세로 구한다.
 */
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

/** 주문번호 생성(ORD-YYYYMMDD-0001) */
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

/** ₩1,234,567 */
export function won(n: number): string {
  return "₩" + n.toLocaleString("ko-KR");
}

// ─────────────────────────── 한글 금액 표기 ───────────────────────────

const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
/** 4자리 안에서의 자릿수 */
const SMALL_UNITS = ["", "십", "백", "천"];
/** 4자리 묶음 단위 */
const BIG_UNITS = ["", "만", "억", "조", "경"];

/**
 * 숫자 → 한글 (3,300,000 → "삼백삼십만").
 *
 * 십·백·천 자리의 '일'은 생략하고(십만), 만·억·조 앞의 '일'은 남긴다(일만이천).
 */
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
    if (group === 0) continue; // 빈 묶음은 통째로 건너뛴다 (1,0000,0000 → 일억)

    let part = "";
    for (let p = 3; p >= 0; p--) {
      const digit = Math.floor(group / Math.pow(10, p)) % 10;
      if (digit === 0) continue;
      // 십·백·천 자리의 '일'은 쓰지 않는다. 일의 자리(p=0)는 그대로 둔다.
      part += (digit === 1 && p > 0 ? "" : DIGITS[digit]) + SMALL_UNITS[p];
    }
    out += part + BIG_UNITS[g];
  }
  return (n < 0 ? "마이너스 " : "") + out;
}

/** 견적서용 한글 금액 표기(일금 삼백삼십만원정) */
export function wonInKorean(n: number): string {
  return `일금 ${koreanNumber(n)}원정`;
}
