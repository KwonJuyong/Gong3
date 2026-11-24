// 기타소득(필요경비 60%, 8.8%, 과세최저한 5만 원) / 사업소득(3.3%, 소액부징수 1천 원 미만)
export type IncomeType = "OTHER" | "BUSINESS";

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  OTHER: "기타소득 (8.8%)",
  BUSINESS: "사업소득 (3.3%)",
};

export interface Withholding {
  incomeType: IncomeType;
  gross: number;
  necessaryExpense: number;
  taxableAmount: number;
  incomeTax: number;
  localTax: number;
  taxAmount: number;
  netAmount: number;
  exempt: boolean;
  exemptReason: string | null;
}

export function computeWithholding(gross: number, incomeType: IncomeType): Withholding {
  const g = Math.max(0, Math.floor(gross));

  if (incomeType === "OTHER") {
    const necessaryExpense = Math.floor(g * 0.6);
    const taxableAmount = g - necessaryExpense;

    if (taxableAmount <= 50000) {
      return zeroTax(incomeType, g, necessaryExpense, taxableAmount, "기타소득 과세최저한(기타소득금액 5만원 이하)");
    }
    const incomeTax = Math.floor(taxableAmount * 0.2);
    const localTax = Math.floor(incomeTax * 0.1);
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

  const incomeTax = Math.floor(g * 0.03);
  if (incomeTax < 1000) {
    return zeroTax(incomeType, g, 0, g, "사업소득 소액부징수(소득세 1천원 미만)");
  }
  const localTax = Math.floor(incomeTax * 0.1);
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

export function nominalRateBp(incomeType: IncomeType): number {
  return incomeType === "OTHER" ? 880 : 330;
}

export interface RewardTaxSnapshot {
  grossAmount: number;
  incomeType: string;
  taxAmount: number;
  netAmount: number;
  taxExempt: boolean;
}

export interface ReportedWithholding extends Withholding {
  mismatch: string | null;
}

// 지방소득세 절사(floor(소득세*0.1)) 오차를 피해 t + floor(t/10) === total 역산
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

export function withholdingForReport(r: RewardTaxSnapshot): ReportedWithholding {
  const incomeType: IncomeType = r.incomeType === "BUSINESS" ? "BUSINESS" : "OTHER";
  const fresh = computeWithholding(r.grossAmount, incomeType);

  if (fresh.taxAmount === r.taxAmount && fresh.netAmount === r.netAmount) {
    return { ...fresh, mismatch: null };
  }

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
