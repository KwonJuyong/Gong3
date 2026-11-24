import { createHmac } from "node:crypto";
import { prisma } from "@/app/db";
import { csvCell } from "@/app/lib/csv";
import { logPersonalData } from "@/app/lib/accessLog";
import { phaseLabel } from "@/app/lib/scenario";
import { scenarioViewer } from "../../access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await scenarioViewer();
  if (user.role !== "ADMIN") return new Response(null, { status: 404 });
  const { projectId } = await params;
  const brief = await prisma.scenarioBrief.findUnique({
    where: { projectId },
    include: {
      releases: true,
      readings: { include: { requests: { orderBy: [{ requestedAt: "asc" }, { id: "asc" }] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      tasks: {
        select: { userId: true, phase: true, startedAt: true, stuckAt: true },
      },
    },
  });
  if (!brief) return new Response(null, { status: 404 });
  const versions = new Map(brief.releases.map((r) => [r.phase, r.version]));
  const tasks = new Map(
    brief.tasks.map((t) => [JSON.stringify([t.userId, t.phase]), t]),
  );
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    return new Response("가명 생성용 세션 키 설정이 필요합니다.", {
      status: 503,
    });
  const alias = (userId: string) =>
    createHmac("sha256", secret).update(JSON.stringify([projectId, userId])).digest("hex").slice(0, 24);
  const file = (rows: unknown[][], name: string) => new Response(
    "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
    { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${name}`, "Cache-Control": "private, no-store" } },
  );
  // 대화 원문은 자유 서술이라 측정 CSV와 분리해 따로 내려받음
  if (new URL(request.url).searchParams.get("kind") === "chat") {
    await logPersonalData(user.id, "EXPORT", "동행 평가 가명 대화 기록 CSV");
    const lines = brief.readings.flatMap((r) =>
      (Array.isArray(r.transcript) ? (r.transcript as { from: string; text: string }[]) : []).map((m, i) => [
        alias(r.userId), phaseLabel(r.phase), i + 1, m.from === "me" ? "학생" : "Evi", m.text,
      ]));
    return file([["평가 내 가명", "기록 시점", "순서", "화자", "내용"], ...lines], "scenario-chat.csv");
  }
  const records = brief.readings.flatMap((r) => {
    const task = tasks.get(JSON.stringify([r.userId, r.phase]));
    return (r.requests.length ? r.requests : [null]).map((request, index) => [
      alias(r.userId),
      phaseLabel(r.phase),
      versions.get(r.phase) ?? brief.version,
      brief.metric,
      brief.unit,
      index === 0 ? r.value : null,
      index === 0 && Array.isArray(r.checks) ? r.checks.join("/") : null,
      index === 0 ? (Array.isArray(r.images) ? r.images.length : 0) : null,
      r.phase === 0 ? "예상 쉬움" : "실제 쉬움",
      index === 0 ? r.rating : null,
      index === 0 ? r.createdAt.toISOString() : null,
      request?.decision,
      versions.get(request?.deployedPhase ?? -1),
      index === 0 ? task?.startedAt.toISOString() : null,
      index === 0 ? task?.stuckAt?.toISOString() : null,
      request?.note ?? "",
      request?.repliedAt?.toISOString(),
      request?.recheckResult,
      request?.recheckedAt?.toISOString(),
      request?.requestedAt?.toISOString(),
      request ? createHmac("sha256", secret).update(JSON.stringify([projectId, "request", request.id])).digest("hex").slice(0, 24) : "",
      index === 0 ? "측정" : "추가 요청",
    ]);
  });
  await logPersonalData(user.id, "EXPORT", "동행 평가 가명 측정 기록 CSV");
  const csv = [
    [
      "평가 내 가명",
      "시점",
      "버전",
      "측정 항목",
      "단위",
      "수행값",
      "항목 응답(yes·no·unknown)",
      "첨부 캡처 수",
      "척도",
      "점수",
      "기록 시각(UTC)",
      "처리 결과",
      "반영 버전",
      "과업 시작(UTC)",
      "첫 막힘(UTC)",
      "개선 의견",
      "회신 시각(UTC)",
      "학생 재확인 결과",
      "학생 재확인 시각(UTC)",
      "개선 요청 시각(UTC)",
      "평가 내 요청 가명",
      "행 구분",
    ],
    ...records,
  ];
  return file(csv, "scenario.csv");
}
