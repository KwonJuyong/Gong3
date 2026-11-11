/**
 * 조회 결과 내보내기.
 *
 * 클라이언트가 보낸 행은 쓰지 않음. 질의 명세(QuerySpec)만 받아 세션 사용자의 역할로
 * 다시 실행하므로, 요청 본문을 조작해도 권한 밖의 데이터가 파일에 들어가지 않음
 * 내보내기도 감사 로그에 남음
 */
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "@/app/db";
import { runQuery, type QuerySpec } from "@/app/lib/queryEngine";
import { buildCsv, buildXlsx, contentDisposition, type Cell } from "@/app/lib/queryExport";
import { QueryResultPdf } from "@/app/lib/QueryResultPdf";
import { recordQueryAudit } from "@/app/lib/queryAudit";

export const runtime = "nodejs";

type Body = { format?: string; question?: string; spec?: QuerySpec };

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!me || me.status !== "ACTIVE")
    return NextResponse.json({ error: "이용할 수 없는 계정입니다." }, { status: 403 });
  const rl = checkLimit("queryExport", me.id);
  if (rl) return NextResponse.json({ error: rl }, { status: 429 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 본문을 해석하지 못했습니다." }, { status: 400 });
  }

  const spec = body.spec;
  if (!spec || typeof spec !== "object" || !spec.model)
    return NextResponse.json({ error: "질의 명세(spec.model)가 필요합니다." }, { status: 400 });

  const format = String(body.format || "xlsx").toLowerCase();
  if (!["xlsx", "csv", "pdf"].includes(format))
    return NextResponse.json({ error: "지원하지 않는 형식입니다 (xlsx, csv, pdf)." }, { status: 400 });

  const question = String(body.question || "").slice(0, 500);
  const started = Date.now();

  // 세션 사용자의 역할로 다시 실행함
  const out = await runQuery(me.role, spec, me.id);

  if (!out.ok) {
    await recordQueryAudit({
      actorId: me.id,
      actorRole: me.role,
      question,
      tool: `export:${format}`,
      policy: out.policy,
      outcome: "BLOCKED",
      reason: out.reason,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ error: out.reason }, { status: 403 });
  }

  await recordQueryAudit({
    actorId: me.id,
    actorRole: me.role,
    question,
    tool: `export:${format}`,
    target: out.target,
    policy: out.policy,
    outcome: "SUCCESS",
    rowCount: out.rowCount,
    durationMs: Date.now() - started,
  });

  const stamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .replace(/[-: ]/g, "")
    .slice(0, 14);
  const rows = out.rows as Array<Record<string, Cell>>;

  if (format === "csv") {
    return new NextResponse(buildCsv(out.columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`조회결과_${out.model}_${stamp}.csv`),
      },
    });
  }

  if (format === "xlsx") {
    const bytes = buildXlsx(out.columns, rows, out.model);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(`조회결과_${out.model}_${stamp}.xlsx`),
      },
    });
  }

  const pdf = await renderToBuffer(
    QueryResultPdf({
      data: {
        title: "조회 결과",
        question: question || `${out.model} / ${out.mode}`,
        requester: me.name,
        generatedAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        columns: out.columns,
        rows: out.rows,
        notes: out.notes,
      },
    }),
  );
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(`조회결과_${out.model}_${stamp}.pdf`),
    },
  });
}
