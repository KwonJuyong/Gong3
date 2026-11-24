import { prisma } from "../db";
import { won } from "./money";
import { createNotifications } from "./notify";
import { withholdingForReport } from "./withholding";
import { isMonthFiled } from "./taxFiling";

const SETTLEMENT_LINK = "/dashboard/settlement";

export function kstParts(d: Date): { year: number; month: number; day: number } {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

function kstMonthRange(year: number, month: number): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(year, month - 1, 1) - 9 * 3600_000);
  const lt = new Date(Date.UTC(year, month, 1) - 9 * 3600_000);
  return { gte, lt };
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export interface MonthlyWithholding {
  year: number;
  month: number;
  payoutCount: number;
  personCount: number;
  gross: number;
  incomeTax: number;
  localTax: number;
  net: number;
}

export async function monthlyWithholding(year: number, month: number): Promise<MonthlyWithholding> {
  const { gte, lt } = kstMonthRange(year, month);
  const payouts = await prisma.payout.findMany({
    where: { status: "PAID", paidAt: { gte, lt } },
    include: {
      reward: {
        select: {
          userId: true,
          grossAmount: true,
          incomeType: true,
          taxAmount: true,
          netAmount: true,
          taxExempt: true,
        },
      },
    },
  });

  const users = new Set<string>();
  let gross = 0;
  let incomeTax = 0;
  let localTax = 0;
  let net = 0;

  for (const p of payouts) {
    const w = withholdingForReport(p.reward);
    users.add(p.reward.userId);
    gross += w.gross;
    incomeTax += w.incomeTax;
    localTax += w.localTax;
    net += w.netAmount;
  }

  return {
    year,
    month,
    payoutCount: payouts.length,
    personCount: users.size,
    gross,
    incomeTax,
    localTax,
    net,
  };
}

export interface Reminder {
  kind: string;
  content: string;
}

export async function dueReminders(now: Date = new Date()): Promise<Reminder[]> {
  const { year, month, day } = kstParts(now);
  const out: Reminder[] = [];

  if (day === 8) {
    const p = prevMonth(year, month);
    const w = await monthlyWithholding(p.year, p.month);
    const filed = await isMonthFiled(p.year, p.month, ["WITHHOLDING", "LOCAL_TAX"]);
    if (w.payoutCount > 0 && !filed) {
      out.push({
        kind: "withholding",
        content:
          `[신고 D-2] ${p.month}월 지급분 원천세: 10일까지\n` +
          `인원 ${w.personCount}명 · 지급액 ${won(w.gross)} · 소득세 ${won(w.incomeTax)} · 지방소득세 ${won(w.localTax)}\n` +
          `① 홈택스: 세금신고 > 원천세 신고 > 일반신고 (세액 0원이어도 신고)\n` +
          `② 위택스: 지방소득세 특별징수: 홈택스 접수증의 "지방소득세 신고이동"으로 넘어가면 재입력 없음`,
      });
    }
  }

  if (day === 25) {
    const p = prevMonth(year, month);
    const w = await monthlyWithholding(p.year, p.month);
    const filed = await isMonthFiled(p.year, p.month, ["SIMPLE_STATEMENT"]);
    if (w.payoutCount > 0 && !filed) {
      out.push({
        kind: "simplified-statement",
        content:
          `[신고] ${p.month}월 지급분 간이지급명세서: 이번 달 말일까지\n` +
          `인원 ${w.personCount}명 · 지급액 ${won(w.gross)}\n` +
          `원천세가 0원이어도 제출 대상입니다 (일시적 인적용역은 과세최저한 면제 예외).\n` +
          `미제출 가산세 지급액 0.25% · 매월 빠짐없이 내면 연 1회 지급명세서는 면제됩니다.`,
      });
    }
  }

  if ((month === 1 || month === 7) && day === 20) {
    out.push({
      kind: "vat",
      content:
        `[신고 D-5] 부가가치세 확정신고: ${month}월 25일까지\n` +
        `정산 화면의 "미납 부가세"와 발행한 세금계산서를 대조하세요.\n` +
        `학생 보상에는 매입세액이 없습니다(비사업자). 운영비 매입자료를 빠짐없이 챙겨야 납부액이 줄어듭니다.`,
    });
  }

  if (month === 5 && day === 25) {
    out.push({
      kind: "income-tax",
      content:
        `[신고 D-6] 종합소득세: 5월 31일까지\n` +
        `학생 지급이 필요경비로 인정되려면 원천징수 + 지급명세서 제출이 되어 있어야 합니다.\n` +
        `이익이 0이거나 결손이어도 신고는 해야 합니다(결손금은 이월공제).`,
    });
  }

  if ((month === 6 || month === 12) && day === 20) {
    const target = month === 6 ? "올해 하반기" : "내년 상반기";
    out.push({
      kind: "semiannual-apply",
      content:
        `[기회] 원천세 반기납부 신청: 이번 달 말일까지만 가능\n` +
        `신청하면 ${target} 지급분부터 매월 대신 반기 1회로 냅니다(상시고용 20인 이하 대상).\n` +
        `홈택스에서 "원천징수세액 반기별 납부 승인" 검색.\n` +
        `반기로 바꿔도 간이지급명세서는 계속 매월입니다.`,
    });
  }

  return out;
}

export interface ReminderResult {
  sent: string[];
  skipped: string[];
}

function sentKey(kind: string, year: number, month: number): string {
  return `tax_reminder:${kind}:${year}-${String(month).padStart(2, "0")}`;
}

export async function runTaxReminders(now: Date = new Date()): Promise<ReminderResult> {
  const { year, month } = kstParts(now);
  const reminders = await dueReminders(now);
  const result: ReminderResult = { sent: [], skipped: [] };
  if (reminders.length === 0) return result;

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return result;

  for (const r of reminders) {
    const key = sentKey(r.kind, year, month);
    const already = await prisma.appSetting.findUnique({ where: { key } });
    if (already) {
      result.skipped.push(r.kind);
      continue;
    }

    await createNotifications(
      admins.map((a) => ({ userId: a.id, content: r.content, type: "SETTLEMENT" })),
      { link: SETTLEMENT_LINK },
    );
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: now.toISOString() },
      create: { key, value: now.toISOString() },
    });
    result.sent.push(r.kind);
  }

  return result;
}
