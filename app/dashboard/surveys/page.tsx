import ClearQueryParams from "@/app/components/ClearQueryParams";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import Link from "next/link";
import { prisma } from "../../db";
import {
  legacySurveyWhere,
  openProjectWhere,
  capacityOf,
  rewardPerPersonOf,
  isPayerUs,
} from "../../lib/approvals";

export const metadata = { title: "평가 찾기" };

const ERR: Record<string, string> = {
  unavailable: "해당 설문을 사용할 수 없습니다.",
  duplicate: "이미 응답한 설문입니다.",
};

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();

  const { submitted, error } = await searchParams;

  // 학생의 「평가 참여」 목록. 공개 조건은 approvals.ts 에서 정한다.
  // 응답은 대시보드 상세에서 하므로 여기서는 링크만 건다.
  const projects = await prisma.project.findMany({
    where: openProjectWhere,
    orderBy: { startTime: "desc" },
    include: {
      order: { select: { rewardPerPerson: true, panelSize: true } },
      responses: { where: { userId }, select: { id: true } },
      enrollments: { where: { userId }, select: { status: true } },
      _count: { select: { responses: true } },
    },
  });

  const versions = await prisma.surveyVersion.findMany({
    where: legacySurveyWhere,
    orderBy: { confirmedAt: "desc" },
    include: {
      service: { select: { name: true, preset: true } },
      responses: { where: { userId }, select: { id: true } },
      // 무료 평가도 있으므로 보상 유무를 표시한다.
      order: { select: { rewardPerPerson: true } },
    },
  });

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["submitted", "error"]} />
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">평가 찾기</h1>
          <p className="text-[15px] text-[var(--muted)] mt-1">신청하면 개설자가 선발하고, 선발되면 알림이 가요.</p>
        </div>

        {submitted === "1" && (
          <div role="status" className="rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] text-sm px-4 py-3">
            응답이 제출되었습니다. 감사합니다!
          </div>
        )}
        {error && ERR[error] && (
          <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--warning-light)] text-[var(--warning)] text-sm px-4 py-3">
            {ERR[error]}
          </div>
        )}

        {/* 평가 목록(한 줄에 하나) */}
        <section className="bg-white rounded-[var(--radius-xl)] px-5">
          {projects.length === 0 && versions.length === 0 && (
            <p className="text-[15px] text-[var(--muted)] text-center py-12">
              지금 참여할 수 있는 평가가 없어요. 새 평가가 열리면 알림으로 알려드려요.
            </p>
          )}
          <ul className="divide-y divide-[var(--gray-100)]">
            {projects.map((p) => {
              const done = p.responses.length > 0;
              const enrolled = p.enrollments[0]?.status;
              const capacity = capacityOf(p);
              const left = Math.max(0, capacity - p._count.responses);
              const unit = rewardPerPersonOf(p);
              // 보상액은 플랫폼이 지급하는 건에만 표시한다(연구비 건은 산학협력단이 지급).
              const reward = isPayerUs(p.fundingType) && unit > 0 ? `${unit.toLocaleString("ko-KR")}원` : null;
              const action = done
                ? { text: "응답 완료", strong: false }
                : enrolled === "ACCEPTED"
                  ? { text: "평가하기", strong: true }
                  : enrolled === "REMOVED"
                    ? { text: "제외됨", strong: false }
                    : enrolled
                      ? { text: "신청함", strong: false }
                      : { text: "신청하기", strong: true };
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard?view=detail&p=${p.id}`}
                    className="flex items-center gap-3 py-4 -mx-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">{p.title}</span>
                      <span className="block text-sm text-[var(--muted)] mt-0.5 truncate">
                        {[reward, `남은 자리 ${left}/${capacity}`, p.location && p.location !== "미정" ? p.location : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-[var(--radius-md)] ${
                        action.strong ? "bg-[var(--accent)] text-white" : "bg-[var(--gray-100)] text-[var(--gray-600)]"
                      }`}
                    >
                      {action.text}
                    </span>
                  </Link>
                </li>
              );
            })}
            {versions.map((v) => {
              const done = v.responses.length > 0;
              // 공개된 회차는 결제된 발주가 있다(legacySurveyWhere). 보상액을 표시한다.
              const reward = v.order ? `${v.order.rewardPerPerson.toLocaleString("ko-KR")}원` : null;
              return (
                <li key={v.id}>
                  <Link
                    href={done ? "#" : `/dashboard/surveys/${v.id}`}
                    aria-disabled={done || undefined}
                    className={`flex items-center gap-3 py-4 -mx-2 px-2 rounded-[var(--radius-md)] ${done ? "pointer-events-none" : "hover:bg-[var(--gray-50)]"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">
                        {v.service.name} <span className="text-[var(--muted)] font-normal">· {v.round}회차</span>
                      </span>
                      <span className="block text-sm text-[var(--muted)] mt-0.5 truncate">
                        {[reward, v.service.preset || null].filter(Boolean).join(" · ") || "설문"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-[var(--radius-md)] ${
                        done ? "bg-[var(--gray-100)] text-[var(--gray-600)]" : "bg-[var(--accent)] text-white"
                      }`}
                    >
                      {done ? "응답 완료" : "평가하기"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
