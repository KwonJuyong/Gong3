import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/app/db";
import { runTaxReminders, dueReminders, monthlyWithholding, kstParts } from "@/app/lib/taxReminder";

// 세금 신고 리마인더. 신고 기한 알림과 홈택스에 옮겨 적을 숫자를 보냄
// 호스트 크론이 하루 한 번 호출함(scripts/tax-reminder-cron.sh).
// 보낼 날에만 보내고 같은 달 같은 종류는 한 번만 보내므로 매일 호출해도 됨

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 길이가 달라도 예외 없이 false 를 돌려주는 상수시간 비교 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.INSIGHTS_CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secret && secretMatches(bearer, secret)) return true;
  const me = await getSessionUser();
  return me?.role === "ADMIN";
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const result = await runTaxReminders();
  return NextResponse.json({ ok: true, ...result });
}

/** 발송 없이 오늘 나갈 알림과 지난달 신고 숫자만 확인함 */
export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const now = new Date();
  const { year, month } = kstParts(now);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [due, summary] = await Promise.all([
    dueReminders(now),
    monthlyWithholding(prev.year, prev.month),
  ]);
  return NextResponse.json({ ok: true, today: { year, month }, due, lastMonth: summary });
}
