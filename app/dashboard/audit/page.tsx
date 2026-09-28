import { redirect } from "next/navigation";
import { prisma } from "../../db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import AuditTable, { type AuditRow } from "./AuditTable";

export const metadata = { title: "조회 감사 로그" };

/**
 * AI 도우미 질의 감사 로그(ADMIN 전용). 누가 무엇을 조회했는지 확인한다.
 * 질의 원문은 저장 전에 redactQuery() 로 민감정보를 지우므로 화면에서 다시 가리지 않는다.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    actor?: string;
    outcome?: string;
    page?: string;
  }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!me || me.role !== "ADMIN" || me.status !== "ACTIVE") redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const PER = 50;

  // KST 로 입력받은 날짜를 UTC 인스턴트로. 한국은 서머타임이 없어 고정 -9h.
  const kstStart = (s: string) => new Date(new Date(`${s}T00:00:00Z`).getTime() - 9 * 3600_000);
  const kstEnd = (s: string) => new Date(new Date(`${s}T00:00:00Z`).getTime() + 15 * 3600_000);

  const where: Record<string, unknown> = {};
  if (sp.from || sp.to) {
    const range: Record<string, Date> = {};
    if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) range.gte = kstStart(sp.from);
    if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) range.lt = kstEnd(sp.to);
    if (Object.keys(range).length) where.createdAt = range;
  }
  if (sp.outcome && ["SUCCESS", "BLOCKED", "ERROR"].includes(sp.outcome)) where.outcome = sp.outcome;

  // 요청자는 이름·학번으로 검색해 id 로 바꾼다.
  const actorQuery = (sp.actor || "").trim();
  if (actorQuery) {
    const matched = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: actorQuery, mode: "insensitive" } },
          { studentId: { contains: actorQuery, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 200,
    });
    // 일치하는 사람이 없으면 빈 결과가 나오게 한다(조건을 빼면 전체가 나온다).
    where.actorId = { in: matched.map((m) => m.id) };
  }

  const [total, logs, stats] = await Promise.all([
    prisma.queryAuditLog.count({ where }),
    prisma.queryAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER,
      take: PER,
    }),
    prisma.queryAuditLog.groupBy({ by: ["outcome"], where, _count: { _all: true } }),
  ]);

  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, studentId: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const rows: AuditRow[] = logs.map((l) => {
    const a = actorById.get(l.actorId);
    return {
      id: l.id,
      at: l.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      actor: a ? `${a.name}(${a.studentId})` : `(삭제된 사용자 ${l.actorId.slice(0, 8)})`,
      actorRole: l.actorRole,
      question: l.question,
      tool: l.tool,
      target: l.target,
      policy: l.policy,
      outcome: l.outcome,
      reason: l.reason,
      rowCount: l.rowCount,
      durationMs: l.durationMs,
    };
  });

  const counts = Object.fromEntries(stats.map((s) => [s.outcome, s._count._all]));

  return (
    <AuditTable
      rows={rows}
      total={total}
      page={page}
      perPage={PER}
      counts={{
        SUCCESS: counts.SUCCESS ?? 0,
        BLOCKED: counts.BLOCKED ?? 0,
        ERROR: counts.ERROR ?? 0,
      }}
      filters={{
        from: sp.from ?? "",
        to: sp.to ?? "",
        actor: actorQuery,
        outcome: sp.outcome ?? "",
      }}
    />
  );
}
