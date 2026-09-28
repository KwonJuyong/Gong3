import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { prisma } from "../../../db";
import CostNav from "../CostNav";

export const metadata = { title: "비용 피드백" };

export default async function FeedbackAnalysisPage() {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const items = await prisma.surveyResponseItem.findMany({
    where: { text: { not: null } },
    select: {
      id: true,
      text: true,
      response: {
        select: {
          user: { select: { name: true } },
          surveyVersion: {
            select: { round: true, service: { select: { name: true } } },
          },
        },
      },
    },
    take: 300,
  });

  const feedbacks = items
    .filter((it) => (it.text || "").trim().length > 0)
    .map((it) => ({
      id: it.id,
      text: (it.text || "").trim(),
      author: it.response?.user?.name || "익명",
      service: it.response?.surveyVersion?.service?.name || "-",
      round: it.response?.surveyVersion?.round ?? null,
    }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <CostNav />

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">LLM 피드백 분석</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            평가 서술형 응답을 LLM이 자동 분류합니다. (카테고리·심각도 분류는 LLM 모듈 연결 후 활성화)
          </p>
        </div>

        {/* 분류 결과 자리(LLM 분류 연결 전) */}
        <section className="bg-white rounded-[var(--radius-xl)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">카테고리 · 심각도 분포</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning-light)] text-[var(--warning)]">
              LLM 분류 대기
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-3xl font-bold text-[var(--foreground)]">{feedbacks.length}건</p>
            <p className="text-sm text-[var(--muted)] mt-1">수집된 서술형 응답</p>
            <p className="text-xs text-[var(--gray-500)] mt-3 max-w-md">
              LLM 자동 분류 모듈(루브릭 기반 채점·카테고리 분류)이 연결되면 카테고리별 분포와
              심각도 요약이 여기에 표시됩니다.
            </p>
          </div>
        </section>

        {/* 피드백 원문 표 */}
        <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--gray-100)] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">피드백 원문</h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">서술형 응답(SurveyResponseItem) 원본</p>
            </div>
            <span className="text-xs text-[var(--muted)]">{feedbacks.length}건</span>
          </div>
          {feedbacks.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] text-center py-12">서술형 응답이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                    <th className="px-4 py-3 font-semibold">응답 원문</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">서비스 / 회차</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">작성자</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">분류</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbacks.map((f) => (
                    <tr key={f.id} className="border-t border-[var(--gray-100)] hover:bg-[var(--gray-50)] align-top">
                      <td className="px-4 py-3 text-[var(--foreground)] max-w-[520px]">{f.text}</td>
                      <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">
                        {f.service}
                        {f.round != null && ` · ${f.round}회차`}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">{f.author}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gray-100)] text-[var(--gray-500)] whitespace-nowrap">
                          미분류
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
