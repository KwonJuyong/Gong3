/**
 * 세무 신고 기록(무엇을, 언제, 얼마로 신고했는가).
 *
 * 수정신고가 있으므로 기록한 금액은 고칠 수 있다. 화면은 현재 집계와 다르면 표시만 하고,
 * 실제로 신고를 고쳤는지는 사람만 알기 때문에 자동으로 덮어쓰지 않는다.
 */
import { prisma } from "@/app/db";
import { simpleStatementRows } from "./simpleStatement";

/** 신고 종류. 한 달에 종류마다 한 건이다. */
export const FILING_KINDS = {
  WITHHOLDING: { label: "원천세", where: "홈택스", dueDay: 10 },
  LOCAL_TAX: { label: "지방소득세", where: "위택스", dueDay: 10 },
  SIMPLE_STATEMENT: { label: "간이지급명세서", where: "홈택스", dueDay: 0 }, // 0 = 말일
} as const;

export type FilingKind = keyof typeof FILING_KINDS;

export const FILING_KIND_LIST = Object.keys(FILING_KINDS) as FilingKind[];

export function isFilingKind(v: string): v is FilingKind {
  return Object.prototype.hasOwnProperty.call(FILING_KINDS, v);
}

/** 그 달 지급분의 신고 기한(KST 날짜 문자열). `dueDay 0` 은 다음 달 말일이다. */
export function dueDateOf(kind: FilingKind, year: number, month: number): Date {
  const d = FILING_KINDS[kind].dueDay;
  // 지급월 다음 달의 dueDay. 말일은 다음다음 달 0일로 잡으면 자동으로 계산된다.
  return d === 0
    ? new Date(Date.UTC(year, month + 1, 0) - 9 * 3600_000 + 86400_000 - 1)
    : new Date(Date.UTC(year, month, d) - 9 * 3600_000 + 86400_000 - 1);
}

export interface FilingRow {
  kind: FilingKind;
  label: string;
  where: string;
  due: Date;
  /** 기한이 지났는데 아직 기록이 없으면 true */
  overdue: boolean;
  filed: {
    id: string;
    status: string;
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
    receiptNo: string | null;
    memo: string | null;
    filedAt: Date;
    amendedAt: Date | null;
  } | null;
  /** 기록된 값과 현재 집계가 다른 사유. 신고 후 지급이 바뀐 경우로, 수정신고가 필요할 수 있다. */
  drift: string | null;
}

export interface MonthFilingStatus {
  year: number;
  month: number;
  /** 현재 집계 (간이지급명세서 기준 = 사람별 합산) */
  current: {
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
  };
  rows: FilingRow[];
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/** 그 달의 신고 현황. 기록(TaxFiling)과 현재 집계를 비교해 다른 곳을 표시한다. */
export async function monthFilingStatus(
  year: number,
  month: number,
  now: Date = new Date(),
): Promise<MonthFilingStatus> {
  const [agg, filings] = await Promise.all([
    simpleStatementRows(year, month),
    prisma.taxFiling.findMany({ where: { year, month } }),
  ]);

  const current = agg.totals;
  const byKind = new Map(filings.map((f) => [f.kind, f]));

  const rows: FilingRow[] = FILING_KIND_LIST.map((kind) => {
    const f = byKind.get(kind);
    const due = dueDateOf(kind, year, month);

    let drift: string | null = null;
    if (f && f.status === "FILED") {
      const diffs: string[] = [];
      if (f.headcount !== current.headcount) {
        diffs.push(`인원 ${f.headcount}명 → ${current.headcount}명`);
      }
      if (f.grossAmount !== current.grossAmount) {
        diffs.push(`지급액 ${won(f.grossAmount)} → ${won(current.grossAmount)}`);
      }
      // 지방소득세 신고에는 소득세 차이를 보이지 않는다.
      if (kind !== "LOCAL_TAX" && f.incomeTax !== current.incomeTax) {
        diffs.push(`소득세 ${won(f.incomeTax)} → ${won(current.incomeTax)}`);
      }
      if (kind !== "WITHHOLDING" && f.localTax !== current.localTax) {
        diffs.push(`지방소득세 ${won(f.localTax)} → ${won(current.localTax)}`);
      }
      if (diffs.length > 0) drift = diffs.join(" · ");
    }

    return {
      kind,
      label: FILING_KINDS[kind].label,
      where: FILING_KINDS[kind].where,
      due,
      overdue: !f && now > due && current.headcount > 0,
      filed: f
        ? {
            id: f.id,
            status: f.status,
            headcount: f.headcount,
            entryCount: f.entryCount,
            grossAmount: f.grossAmount,
            incomeTax: f.incomeTax,
            localTax: f.localTax,
            receiptNo: f.receiptNo,
            memo: f.memo,
            filedAt: f.filedAt,
            amendedAt: f.amendedAt,
          }
        : null,
      drift,
    };
  });

  return { year, month, current, rows };
}

/**
 * 지정한 신고가 그 달에 모두 기록됐는지. 리마인더가 알림을 건너뛸지 정하는 데 쓴다.
 * 원천세(홈택스)와 지방소득세(위택스)는 따로 신고하므로 각각 확인한다.
 */
export async function isMonthFiled(
  year: number,
  month: number,
  kinds: FilingKind[],
): Promise<boolean> {
  const n = await prisma.taxFiling.count({ where: { year, month, kind: { in: kinds } } });
  return n >= kinds.length;
}
