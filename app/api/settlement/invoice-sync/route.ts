import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { getSessionUser } from "@/app/db";
import { syncTaxInvoiceStates } from "@/app/lib/payments";

// 세금계산서 국세청 전송 결과(304 성공 / 305 실패) 확인.
// 팝빌은 국세청 전송을 비동기로 처리하므로 발행 후 따로 확인해야 함
// 호스트 크론이 하루 한 번 공유 비밀로 호출함(scripts/invoice-cron.sh).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 길이가 달라도 예외 없이 false를 돌려주는 상수시간 비교 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.INSIGHTS_CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  // 크론(공유 비밀) 또는 관리자(세션). 관리자는 발행 직후 화면에서 바로 확인할 때 씀
  let allowed = Boolean(secret) && secretMatches(bearer, secret!);
  if (!allowed) {
    const me = await getSessionUser();
    allowed = me?.role === "ADMIN";
    const rl = allowed && me ? checkLimit("adminJob", me.id) : null;
    if (rl) return NextResponse.json({ error: rl }, { status: 429 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const result = await syncTaxInvoiceStates();

  return NextResponse.json({ ok: true, ...result });
}
