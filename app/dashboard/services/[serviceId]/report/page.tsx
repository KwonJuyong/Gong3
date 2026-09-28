import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../db";
import { type SurveyBlock } from "../../../../lib/surveyBlocks";
import { scoreSurvey, type RaterRaw } from "../../../../lib/surveyScore";
import { answersToRater, type ProjectQuestion } from "../../../../lib/projectQuestions";

export const metadata = { title: "평가 리포트" };

function bar(score: number) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct < 40 ? "bg-red-500" : pct < 70 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="w-full h-2 rounded-full bg-[var(--gray-200)] overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const METHOD_LABEL: Record<string, string> = {
  anchored: "앵커링 보정",
  raw: "원점수",
  instrument: "검증도구",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");

  const { serviceId } = await params;
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) notFound();
  if (service.ownerId !== me.id && me.role !== "ADMIN") redirect("/dashboard/services");

  const version = await prisma.surveyVersion.findFirst({
    where: { serviceId, status: "CONFIRMED" },
    orderBy: { round: "desc" },
    include: {
      responses: { include: { items: true } },
      // 이 회차로 만든 평가(Project)의 응답도 함께 읽는다.
      sourcedProjects: {
        select: {
          questions: true,
          responses: { select: { userId: true, answers: true } },
        },
      },
    },
  });

  const blocks = (version?.blocks as unknown as SurveyBlock[]) || [];

  // 이전 방식: SurveyResponse + SurveyResponseItem(itemKey/score/text)
  const legacyRaters: RaterRaw[] = (version?.responses || []).map((r) => {
    const scores: Record<string, number> = {};
    const texts: Record<string, string> = {};
    for (const it of r.items) {
      if (typeof it.score === "number") scores[it.itemKey] = it.score;
      if (it.text) texts[it.itemKey] = it.text;
    }
    return { userId: r.userId, scores, texts };
  });

  // 평가 응답: Response.answers(JSON). itemKey 가 없는 수동 문항은 answersToRater 가 건너뛴다.
  const projectRaters: RaterRaw[] = (version?.sourcedProjects || []).flatMap((p) => {
    const qs = (p.questions as unknown as ProjectQuestion[]) || [];
    return p.responses.map((r) =>
      answersToRater(r.userId, qs, (r.answers as Record<string, unknown>) || {}),
    );
  });

  const raters: RaterRaw[] = [...legacyRaters, ...projectRaters];

  const report = version ? scoreSurvey(blocks, raters) : null;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link href={`/dashboard/services/${serviceId}`} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 설문 관리
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">{service.name} 진단 리포트</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {version ? `회차 ${version.round} · 응답 ${report?.responseCount ?? 0}명` : "확정된 설문이 없습니다."}
          </p>
        </div>

        {!version && (
          <p className="text-sm text-[var(--gray-500)] text-center py-10">먼저 설문을 최종 확정해야 리포트가 생성됩니다.</p>
        )}

        {version && report && report.responseCount === 0 && (
          <p className="text-sm text-[var(--gray-500)] text-center py-10">아직 응답이 없습니다. 평가단 응답이 모이면 점수가 표시됩니다.</p>
        )}

        {version && report && report.responseCount > 0 && (
          <>
            {/* 개선 우선순위 */}
            <section className="bg-white rounded-[var(--radius-xl)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">개선 우선순위 (약점 순)</h3>
              <div className="space-y-3">
                {report.weakest.map((c, i) => (
                  <div key={c.constructId} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--foreground)]">{c.constructName}</span>
                        <span className="text-xs text-[var(--muted)]">{c.score.toFixed(1)}점</span>
                      </div>
                      {bar(c.score)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 전체 항목 점수 */}
            <section className="bg-white rounded-[var(--radius-xl)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">전체 평가 항목</h3>
              <div className="space-y-3">
                {report.constructs.map((c) => (
                  <div key={c.constructId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-[var(--foreground)]">
                          {c.constructName}
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {METHOD_LABEL[c.method]}
                          </span>
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {c.score.toFixed(1)}점
                          {c.method === "anchored" && c.rawScore != null && (
                            <span className="text-[var(--gray-500)]"> (보정전 {c.rawScore.toFixed(1)})</span>
                          )}
                        </span>
                      </div>
                      {bar(c.score)}
                      {c.dropped > 0 && (
                        <p className="text-xs text-[var(--gray-500)] mt-0.5">일관성 위반 {c.dropped}명 제외 · 유효 {c.n}명</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* UEQ 차원 */}
            {report.ueq && report.ueq.length > 0 && (
              <section className="bg-white rounded-[var(--radius-xl)] p-5">
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">사용자 경험 (UEQ, -3 ~ +3)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {report.ueq.map((d) => (
                    <div key={d.dimension} className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)]">
                      <p className="text-xs text-[var(--muted)]">{d.dimension}</p>
                      <p className={`text-lg font-bold ${d.mean >= 0.8 ? "text-green-600" : d.mean <= -0.8 ? "text-red-600" : "text-[var(--foreground)]"}`}>
                        {d.mean.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 서술형 의견 */}
            <section className="bg-white rounded-[var(--radius-xl)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">개선 의견 (서술형)</h3>
              {report.constructs.filter((c) => c.comments.length > 0).length === 0 ? (
                <p className="text-sm text-[var(--gray-500)]">수집된 서술형 의견이 없습니다.</p>
              ) : (
                <div className="space-y-4">
                  {report.constructs
                    .filter((c) => c.comments.length > 0)
                    .map((c) => (
                      <div key={c.constructId}>
                        <p className="text-xs font-semibold text-[var(--muted)] mb-1">{c.constructName}</p>
                        <ul className="space-y-1">
                          {c.comments.map((t, i) => (
                            <li key={i} className="text-sm text-[var(--foreground)] pl-3 border-l-2 border-[var(--gray-200)]">
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
