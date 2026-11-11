import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { getSessionUser } from "@/app/db";
import { syncInsights } from "@/app/lib/insights/sync";

// AI News 수집 트리거. 호스트 크론이 공유 비밀로 호출함(scripts/insights-cron.sh).
// 외부 API 호출과 요약 비용이 드므로 비밀 또는 관리자 세션이 없으면 거절함

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 요약까지 돌면 수십 초가 걸림

/** 길이가 달라도 예외 없이 false를 돌려주는 상수시간 비교 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.INSIGHTS_CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  // 크론(공유 비밀) 또는 관리자(세션) 둘 중 하나면 통과.
  // 관리자 경로를 열어두는 건 장애 시 화면에서 바로 재수집하기 위해서임
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

  // ?only=arxiv,epoch: 특정 소스만 재시도할 때 씀
  const only = req.nextUrl.searchParams.get("only")?.split(",").map((s) => s.trim());
  const results = await syncInsights(only?.filter(Boolean));

  // 소스 하나가 실패해도 나머지는 저장됐음. 전체를 실패로 뭉뚱그리지 않고 소스별로 돌려줌
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json(
    { ok: failed.length === 0, results },
    { status: failed.length === results.length && results.length > 0 ? 502 : 200 },
  );
}
