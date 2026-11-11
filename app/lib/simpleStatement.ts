/**
 * 간이지급명세서(거주자의 기타소득) 신고 자료 집계. 국세청 일괄등록 양식의 행을 만듦
 *
 * 지급명세서는 소득자 1명당 1행이므로 그 달의 지급을 userId 로 묶음
 *
 * 필요경비는 올림함. 양식은 필요경비가 지급액의 60% 미만이면 오류로 처리하는데,
 * 내림하면 60% 에 못 미칠 수 있음. 세액은 실제 원천징수한 값(Reward 저장값)을 씀
 *
 * 사업소득(incomeType === "BUSINESS")은 다른 서식이라 제외하고 화면에 알림
 */
import { prisma } from "@/app/db";
import { decryptRRN } from "./crypto";
import { withholdingForReport } from "./withholding";

/** 소득구분코드: 76: 인적용역(강연료 등, 필요경비 60%) */
export const INCOME_CODE_PERSONAL_SERVICE = "76";

export interface SimpleStatementRow {
  userId: string;
  name: string;
  /** 숫자 13자리. 없으면 빈 문자열(제출 불가) */
  rrn: string;
  /** 지급건수 = 그 달에 그 사람에게 지급이 발생한 건수 */
  entryCount: number;
  grossAmount: number;
  necessaryExpense: number;
  incomeAmount: number;
  incomeTax: number;
  localTax: number;
  /** 스냅샷과 현행 계산이 어긋난 사유(있으면 화면에 드러냄) */
  mismatch: string | null;
}

export interface SimpleStatementResult {
  year: number;
  month: number;
  rows: SimpleStatementRow[];
  /** 합계(홈택스 요약줄과 대조) */
  totals: {
    /** 행 수(인원). 지급건수 합과 다름 */
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
  };
  /** 다운로드를 막아야 하는 사유 */
  blockers: string[];
  /** 막지는 않지만 알려야 하는 것 */
  warnings: string[];
  /** 주민등록번호가 없어 제출할 수 없는 사람(화면 표시용) */
  missingRrn: { userId: string; name: string; grossAmount: number }[];
}

/** KST 기준 그 달의 시작·끝(다음 달 시작)을 UTC 인스턴트로. 한국은 서머타임이 없음 */
function kstMonthRange(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1) - 9 * 3600_000),
    lt: new Date(Date.UTC(year, month, 1) - 9 * 3600_000),
  };
}

/** 하이픈·공백을 걷어낸 숫자만. 13자리가 아니면 빈 문자열(= 없음으로 취급). */
function normalizeRrn(raw: string): string {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  return digits.length === 13 ? digits : "";
}

/** 그 달에 실제 지급된(Payout.paidAt) 건을 소득자별로 묶음 */
export async function simpleStatementRows(
  year: number,
  month: number,
): Promise<SimpleStatementResult> {
  const { gte, lt } = kstMonthRange(year, month);

  const payouts = await prisma.payout.findMany({
    where: { status: "PAID", paidAt: { gte, lt } },
    include: {
      reward: {
        include: {
          user: {
            select: { id: true, name: true, payrollProfile: { select: { rrnEnc: true } } },
          },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  const byUser = new Map<string, SimpleStatementRow>();
  let businessCount = 0;
  let businessGross = 0;

  for (const p of payouts) {
    const r = p.reward;

    // 사업소득은 별도 서식임
    if (r.incomeType === "BUSINESS") {
      businessCount += 1;
      businessGross += r.grossAmount;
      continue;
    }

    const w = withholdingForReport(r);
    const uid = r.user.id;
    const cur = byUser.get(uid);

    if (cur) {
      cur.entryCount += 1;
      cur.grossAmount += w.gross;
      cur.incomeTax += w.incomeTax;
      cur.localTax += w.localTax;
      if (w.mismatch && !cur.mismatch) cur.mismatch = w.mismatch;
    } else {
      byUser.set(uid, {
        userId: uid,
        name: r.user.name,
        rrn: normalizeRrn(decryptRRN(r.user.payrollProfile?.rrnEnc)),
        entryCount: 1,
        grossAmount: w.gross,
        necessaryExpense: 0, // 합산이 끝난 뒤 한 번에 계산함
        incomeAmount: 0,
        incomeTax: w.incomeTax,
        localTax: w.localTax,
        mismatch: w.mismatch,
      });
    }
  }

  const rows = [...byUser.values()];

  // 필요경비·소득금액은 사람별로 합산한 뒤 계산해야 양식 검증(소득금액 = 지급액 − 필요경비)과 맞음
  for (const row of rows) {
    row.necessaryExpense = Math.ceil(row.grossAmount * 0.6);
    row.incomeAmount = row.grossAmount - row.necessaryExpense;
  }

  rows.sort((a, b) => b.grossAmount - a.grossAmount || a.name.localeCompare(b.name, "ko"));

  const missingRrn = rows
    .filter((r) => !r.rrn)
    .map((r) => ({ userId: r.userId, name: r.name, grossAmount: r.grossAmount }));

  const totals = rows.reduce(
    (acc, r) => ({
      headcount: acc.headcount + 1,
      entryCount: acc.entryCount + r.entryCount,
      grossAmount: acc.grossAmount + r.grossAmount,
      incomeTax: acc.incomeTax + r.incomeTax,
      localTax: acc.localTax + r.localTax,
    }),
    { headcount: 0, entryCount: 0, grossAmount: 0, incomeTax: 0, localTax: 0 },
  );

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    blockers.push(`${year}년 ${month}월에 지급된 건이 없습니다.`);
  }
  if (missingRrn.length > 0) {
    // 주민번호가 없으면 「불분명」으로 가산세 대상임(간이 0.25%). 다만 불분명 금액이
    // 총지급액의 5% 이하면 미적용이라, 그 비율을 같이 보여줌
    const missingGross = missingRrn.reduce((s, m) => s + m.grossAmount, 0);
    const pct = totals.grossAmount > 0 ? (missingGross / totals.grossAmount) * 100 : 0;
    blockers.push(
      `주민등록번호가 없는 소득자 ${missingRrn.length}명 (${missingGross.toLocaleString("ko-KR")}원, ` +
        `총지급액의 ${pct.toFixed(1)}%). 지급명세서 필수 항목이라 비우면 「불분명」으로 ` +
        `가산세 대상입니다. 불분명 금액이 총지급액의 5% 이하면 미적용.`,
    );
  }
  if (businessCount > 0) {
    warnings.push(
      `사업소득 ${businessCount}건(${businessGross.toLocaleString("ko-KR")}원)은 제외했습니다. ` +
        `「간이지급명세서(거주자의 사업소득)」로 따로 제출해야 합니다.`,
    );
  }
  const mismatched = rows.filter((r) => r.mismatch);
  if (mismatched.length > 0) {
    warnings.push(
      `스냅샷과 현행 계산이 어긋난 소득자 ${mismatched.length}명: 신고액은 실제 지급액(스냅샷)을 씁니다.`,
    );
  }

  return { year, month, rows, totals, blockers, warnings, missingRrn };
}
