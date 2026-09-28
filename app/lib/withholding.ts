/**
 * 평가단 보상의 원천징수 계산. 소득 구분은 AppSetting 으로 정하고 Reward 에 함께 저장한다.
 *
 * 기타소득(일시적 인적용역) — OTHER
 * - 필요경비 60% 의제, 기타소득금액 = 지급액 × 40%
 * - 과세최저한: 기타소득금액 50,000원 이하(지급액 125,000원 이하)면 원천징수 0
 * - 세액 = 기타소득금액 × 22%(소득세 20% + 지방소득세 2%) = 지급액 × 8.8%
 *
 * 사업소득(계속·반복적 인적용역) — BUSINESS
 * - 3.3%(소득세 3% + 지방소득세 0.3%)
 * - 소액부징수: 소득세 1,000원 미만(지급액 33,333원 이하)이면 징수하지 않는다
 *
 * 금액은 정수(원)이고 소득세·지방소득세를 각각 원 단위로 절사한 뒤 합한다.
 */

export type IncomeType = "OTHER" | "BUSINESS";

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  OTHER: "기타소득 (8.8%)",
  BUSINESS: "사업소득 (3.3%)",
};

export interface Withholding {
  incomeType: IncomeType;
  gross: number; // 지급액(세전)
  necessaryExpense: number; // 필요경비 (기타소득만, 사업소득은 0)
  taxableAmount: number; // 원천징수 대상 소득금액
  incomeTax: number; // 소득세(국세)
  localTax: number; // 지방소득세
  taxAmount: number; // 원천징수 합계 = incomeTax + localTax
  netAmount: number; // 실지급액 = gross - taxAmount
  exempt: boolean; // 과세최저한/소액부징수로 세금 0 인가
  exemptReason: string | null;
}

export function computeWithholding(gross: number, incomeType: IncomeType): Withholding {
  const g = Math.max(0, Math.floor(gross));

  if (incomeType === "OTHER") {
    // 기타소득: 필요경비 60% 의제
    const necessaryExpense = Math.floor(g * 0.6);
    const taxableAmount = g - necessaryExpense; // = 40%

    // 과세최저한: 기타소득금액 5만원 이하 비과세
    if (taxableAmount <= 50000) {
      return zeroTax(incomeType, g, necessaryExpense, taxableAmount, "기타소득 과세최저한(기타소득금액 5만원 이하)");
    }
    const incomeTax = Math.floor(taxableAmount * 0.2); // 소득세 20%
    const localTax = Math.floor(incomeTax * 0.1); // 지방소득세 = 소득세 10%
    const taxAmount = incomeTax + localTax;
    return {
      incomeType,
      gross: g,
      necessaryExpense,
      taxableAmount,
      incomeTax,
      localTax,
      taxAmount,
      netAmount: g - taxAmount,
      exempt: false,
      exemptReason: null,
    };
  }

  // 사업소득: 3.3%
  const incomeTax = Math.floor(g * 0.03); // 소득세 3%
  // 소액부징수: 소득세 1,000원 미만이면 원천징수하지 않는다
  if (incomeTax < 1000) {
    return zeroTax(incomeType, g, 0, g, "사업소득 소액부징수(소득세 1천원 미만)");
  }
  const localTax = Math.floor(incomeTax * 0.1); // 지방소득세 = 소득세 10%
  const taxAmount = incomeTax + localTax;
  return {
    incomeType,
    gross: g,
    necessaryExpense: 0,
    taxableAmount: g,
    incomeTax,
    localTax,
    taxAmount,
    netAmount: g - taxAmount,
    exempt: false,
    exemptReason: null,
  };
}

function zeroTax(
  incomeType: IncomeType,
  gross: number,
  necessaryExpense: number,
  taxableAmount: number,
  reason: string,
): Withholding {
  return {
    incomeType,
    gross,
    necessaryExpense,
    taxableAmount,
    incomeTax: 0,
    localTax: 0,
    taxAmount: 0,
    netAmount: gross,
    exempt: true,
    exemptReason: reason,
  };
}

/** 소득 구분의 명목 원천징수율(bp). Reward.taxRateBp 저장·표시용 */
export function nominalRateBp(incomeType: IncomeType): number {
  return incomeType === "OTHER" ? 880 : 330;
}

// ───────────────────────── 신고 자료용 ─────────────────────────

/** 신고 자료에 필요한 Reward 필드. 지급 시점에 computeWithholding 으로 계산해 저장한 값이다. */
export interface RewardTaxSnapshot {
  grossAmount: number;
  incomeType: string;
  taxAmount: number;
  netAmount: number;
  taxExempt: boolean;
}

export interface ReportedWithholding extends Withholding {
  /** 스냅샷과 현행 계산이 어긋나면 그 사유. 일치하면 null */
  mismatch: string | null;
}

/**
 * 원천징수 합계에서 소득세·지방소득세를 역산한다.
 * 지방소득세 = floor(소득세 × 0.1) 이라 나눗셈으로는 1원씩 어긋날 수 있어,
 * 근삿값 주변에서 t + floor(t/10) === total 을 만족하는 값을 찾는다.
 */
function splitTax(total: number): { incomeTax: number; localTax: number } {
  const approx = Math.floor((total * 10) / 11);
  for (let d = 0; d <= 2; d++) {
    for (const t of d === 0 ? [approx] : [approx + d, approx - d]) {
      if (t >= 0 && t + Math.floor(t / 10) === total) {
        return { incomeTax: t, localTax: total - t };
      }
    }
  }
  return { incomeTax: approx, localTax: total - approx };
}

/**
 * 지급명세서·원천세 신고용 금액.
 *
 * 신고할 값은 실제로 지급하고 원천징수한 금액이므로, 지급액·원천징수 합계·실지급액은
 * Reward 에 저장된 값을 그대로 쓰고 필요경비·소득세 등 세부 내역만 다시 계산한다.
 * 저장값과 현재 계산이 다르면 mismatch 에 사유를 담아 CSV 에 보여준다.
 */
export function withholdingForReport(r: RewardTaxSnapshot): ReportedWithholding {
  const incomeType: IncomeType = r.incomeType === "BUSINESS" ? "BUSINESS" : "OTHER";
  const fresh = computeWithholding(r.grossAmount, incomeType);

  if (fresh.taxAmount === r.taxAmount && fresh.netAmount === r.netAmount) {
    return { ...fresh, mismatch: null };
  }

  // 다르면 저장값을 기준으로 세부 내역을 역산한다.
  const { incomeTax, localTax } = r.taxExempt
    ? { incomeTax: 0, localTax: 0 }
    : splitTax(r.taxAmount);

  return {
    incomeType,
    gross: r.grossAmount,
    necessaryExpense: fresh.necessaryExpense,
    taxableAmount: fresh.taxableAmount,
    incomeTax,
    localTax,
    taxAmount: r.taxAmount,
    netAmount: r.netAmount,
    exempt: r.taxExempt,
    exemptReason: r.taxExempt ? (fresh.exemptReason ?? "지급 시점 비과세") : null,
    mismatch: `지급시점 세액 ${r.taxAmount}·실지급 ${r.netAmount} ≠ 현행계산 ${fresh.taxAmount}·${fresh.netAmount}`,
  };
}
