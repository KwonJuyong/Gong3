/**
 * 세금 신고 리마인더. 신고 기한 전에 관리자에게 알림과 신고할 숫자를 보낸다.
 *
 * | 주기 | 무엇 | 어디 | 기한 |
 * |---|---|---|---|
 * | 매월 | 원천징수이행상황신고서 | 홈택스 | 다음 달 10일 |
 * | 매월 | 지방소득세 특별징수분 | 위택스 | 다음 달 10일 |
 * | 매월 | 간이지급명세서 | 홈택스 | 다음 달 말일 |
 * | 반기 | 부가가치세 확정신고 | 홈택스 | 1/25 · 7/25 |
 * | 연 1회 | 종합소득세 | 홈택스 | 5/31 |
 * | 6월·12월 | 원천세 반기납부 신청 | 홈택스 | 그 달 말일 |
 *
 * 세액이 0원이어도 간이지급명세서는 제출해야 한다(일시적 인적용역은 과세최저한 제출 면제의 예외).
 *
 * 보낸 이력을 AppSetting(tax_reminder:<kind>:<yyyy-mm>)에 남겨 같은 알림을 두 번 보내지 않는다.
 * 매월 신고는 TaxFiling 에 제출 기록이 있으면 보내지 않는다.
 */

import { prisma } from "../db";
import { won } from "./money";
import { createNotifications } from "./notify";
import { withholdingForReport } from "./withholding";
import { isMonthFiled } from "./taxFiling";

const SETTLEMENT_LINK = "/dashboard/settlement";

// ─────────────────────────── 날짜 (KST 고정) ───────────────────────────

/** KST 기준 연·월·일. 서버 TZ 가 UTC 여도 한국 날짜로 판단한다(+9 고정). */
export function kstParts(d: Date): { year: number; month: number; day: number } {
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

/** KST 기준 그 달의 시작·끝(다음 달 시작)을 UTC 인스턴트로 */
function kstMonthRange(year: number, month: number): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(year, month - 1, 1) - 9 * 3600_000);
  const lt = new Date(Date.UTC(year, month, 1) - 9 * 3600_000);
  return { gte, lt };
}

/** 직전 달 (1월이면 작년 12월) */
function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// ─────────────────────────── 월별 집계 ───────────────────────────

export interface MonthlyWithholding {
  year: number;
  month: number;
  payoutCount: number; // 지급 건수
  personCount: number; // 인원 (한 사람이 여러 건이면 1명)
  gross: number; // 지급액(세전) 합계
  incomeTax: number; // 소득세 합계(홈택스 원천세 신고용)
  localTax: number; // 지방소득세 합계(위택스 신고용)
  net: number; // 실지급 합계
}

/**
 * 그 달에 실제로 지급된(Payout.paidAt) 보상을 집계한다.
 * 홈택스와 위택스에 따로 신고하므로 소득세와 지방소득세를 나눠서 돌려준다.
 */
export async function monthlyWithholding(year: number, month: number): Promise<MonthlyWithholding> {
  const { gte, lt } = kstMonthRange(year, month);
  const payouts = await prisma.payout.findMany({
    where: { status: "PAID", paidAt: { gte, lt } },
    // 세액·실지급액은 지급 시점 값을 그대로 쓴다.
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

// ─────────────────────────── 리마인더 판정 ───────────────────────────

export interface Reminder {
  /** 멱등키의 종류 부분. `tax_reminder:<kind>:<yyyy-mm>` */
  kind: string;
  content: string;
}

/**
 * 오늘 보낼 리마인더 목록.
 * 원천세·명세서는 기한 2~5일 전, 준비할 자료가 많은 부가세·종소세는 5~6일 전에 보낸다.
 */
export async function dueReminders(now: Date = new Date()): Promise<Reminder[]> {
  const { year, month, day } = kstParts(now);
  const out: Reminder[] = [];

  // 매월 8일: 원천세(홈택스) + 지방소득세(위택스), 기한 10일
  if (day === 8) {
    const p = prevMonth(year, month);
    const w = await monthlyWithholding(p.year, p.month);
    // 원천세와 지방소득세가 모두 기록됐으면 보내지 않는다.
    const filed = await isMonthFiled(p.year, p.month, ["WITHHOLDING", "LOCAL_TAX"]);
    // 지급이 없던 달은 보내지 않는다.
    if (w.payoutCount > 0 && !filed) {
      out.push({
        kind: "withholding",
        content:
          `[신고 D-2] ${p.month}월 지급분 원천세 — 10일까지\n` +
          `인원 ${w.personCount}명 · 지급액 ${won(w.gross)} · 소득세 ${won(w.incomeTax)} · 지방소득세 ${won(w.localTax)}\n` +
          `① 홈택스: 세금신고 > 원천세 신고 > 일반신고 (세액 0원이어도 신고)\n` +
          `② 위택스: 지방소득세 특별징수 — 홈택스 접수증의 "지방소득세 신고이동"으로 넘어가면 재입력 없음`,
      });
    }
  }

  // 매월 25일: 간이지급명세서, 기한 말일
  if (day === 25) {
    const p = prevMonth(year, month);
    const w = await monthlyWithholding(p.year, p.month);
    const filed = await isMonthFiled(p.year, p.month, ["SIMPLE_STATEMENT"]);
    if (w.payoutCount > 0 && !filed) {
      out.push({
        kind: "simplified-statement",
        content:
          `[신고] ${p.month}월 지급분 간이지급명세서 — 이번 달 말일까지\n` +
          `인원 ${w.personCount}명 · 지급액 ${won(w.gross)}\n` +
          `⚠ 원천세가 0원이어도 제출 대상입니다 (일시적 인적용역은 과세최저한 면제 예외).\n` +
          `미제출 가산세 지급액 0.25% · 매월 빠짐없이 내면 연 1회 지급명세서는 면제됩니다.`,
      });
    }
  }

  // 1월·7월 20일: 부가세 확정신고, 기한 25일
  if ((month === 1 || month === 7) && day === 20) {
    out.push({
      kind: "vat",
      content:
        `[신고 D-5] 부가가치세 확정신고 — ${month}월 25일까지\n` +
        `정산 화면의 "미납 부가세"와 발행한 세금계산서를 대조하세요.\n` +
        `⚠ 학생 보상에는 매입세액이 없습니다(비사업자). 운영비 매입자료를 빠짐없이 챙겨야 납부액이 줄어듭니다.`,
    });
  }

  // 5월 25일: 종합소득세, 기한 31일
  if (month === 5 && day === 25) {
    out.push({
      kind: "income-tax",
      content:
        `[신고 D-6] 종합소득세 — 5월 31일까지\n` +
        `⚠ 학생 지급이 필요경비로 인정되려면 원천징수 + 지급명세서 제출이 되어 있어야 합니다.\n` +
        `이익이 0이거나 결손이어도 신고는 해야 합니다(결손금은 이월공제).`,
    });
  }

  // 6월·12월 20일: 원천세 반기납부 신청(그 달에만 신청할 수 있다)
  if ((month === 6 || month === 12) && day === 20) {
    const target = month === 6 ? "올해 하반기" : "내년 상반기";
    out.push({
      kind: "semiannual-apply",
      content:
        `[기회] 원천세 반기납부 신청 — 이번 달 말일까지만 가능\n` +
        `신청하면 ${target} 지급분부터 매월 대신 반기 1회로 냅니다(상시고용 20인 이하 대상).\n` +
        `홈택스에서 "원천징수세액 반기별 납부 승인" 검색.\n` +
        `⚠ 반기로 바꿔도 간이지급명세서는 계속 매월입니다.`,
    });
  }

  return out;
}

// ─────────────────────────── 발송 ───────────────────────────

export interface ReminderResult {
  sent: string[]; // 이번에 보낸 kind
  skipped: string[]; // 이미 보낸 kind
}

/** 같은 달에 같은 종류를 두 번 보내지 않기 위한 키 */
function sentKey(kind: string, year: number, month: number): string {
  return `tax_reminder:${kind}:${year}-${String(month).padStart(2, "0")}`;
}

/**
 * [크론] 오늘 보낼 리마인더를 관리자에게 발송한다.
 *
 * 보낸 이력을 AppSetting 에 남기므로 하루 여러 번 실행해도 된다.
 */
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
    // 발송에 실패하면 다음에 다시 보내도록 발송 후에 기록한다.
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: now.toISOString() },
      create: { key, value: now.toISOString() },
    });
    result.sent.push(r.kind);
  }

  return result;
}
