import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
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
import { enrollProjectAction } from "../actions";

export const metadata = { title: "평가 찾기" };

const ERR: Record<string, string> = {
  unavailable: "해당 평가를 사용할 수 없습니다.",
  duplicate: "이미 응답한 평가입니다.",
};

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string; enrolled?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();

  const { submitted, error, enrolled: justEnrolled } = await searchParams;
  const now = new Date();

  const myResponses = await prisma.response.findMany({
    where: { userId },
    select: { project: { select: { id: true, title: true, status: true, startTime: true } } },
    orderBy: { createdAt: "desc" },
  });
  // 한 평가에 응답이 여러 개일 수 있어 중복을 제거함
  const participated = [...new Map(myResponses.flatMap((r) => (r.project ? [[r.project.id, r.project] as const] : []))).values()];

  // 학생의 「평가 참여」 목록. 공개 조건은 approvals.ts 에서 정함
  // 신청은 목록에서 바로, 응답은 대시보드 응답 화면에서 함
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
      // 무료 평가도 있으므로 보상 유무를 표시함
      order: { select: { rewardPerPerson: true } },
    },
  });

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["submitted", "error", "enrolled"]} />
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">평가 찾기</h1>
          <p className="text-[15px] text-[var(--muted)] mt-1">신청하면 개설자가 선발하고, 선발되면 알림이 가요.</p>
        </div>

        {submitted === "1" && (
          <div role="status" className="rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] text-sm px-4 py-3">
            응답이 제출되었습니다. 감사합니다!
          </div>
        )}
        {justEnrolled === "1" && (
          <div role="status" className="rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] text-sm px-4 py-3">
            신청했어요. 선발되면 알림으로 알려드려요.
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
              // 보상액은 플랫폼이 지급하는 건에만 표시함(연구비 건은 산학협력단이 지급).
              const reward = isPayerUs(p.fundingType) && unit > 0 ? `${unit.toLocaleString("ko-KR")}원` : null;
              const deadlinePassed = !!p.enrollmentDeadline && now > p.enrollmentDeadline;
              const canEnroll = !done && !enrolled && p.status === "RECRUITING" && !deadlinePassed;
              const canAnswer = !done && enrolled === "ACCEPTED" && p.status === "ACTIVE";
              const chip = done
                ? "응답 완료"
                : enrolled === "ACCEPTED"
                  ? "선발됨"
                  : enrolled === "REMOVED"
                    ? "제외됨"
                    : enrolled
                      ? "신청함"
                      : "모집 마감";
              const btn = "shrink-0 text-sm font-semibold px-3.5 py-2 rounded-[var(--radius-md)]";
              return (
                <li key={p.id} className="flex items-center gap-3 py-4">
                  <Link
                    href={`/dashboard?view=detail&p=${p.id}`}
                    className="min-w-0 flex-1 -mx-2 px-2 py-1 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                  >
                    <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">{p.title}</span>
                    <span className="block text-sm text-[var(--muted)] mt-0.5 truncate">
                      {[reward, `남은 자리 ${left}/${capacity}`, p.location && p.location !== "미정" ? p.location : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                  {canEnroll ? (
                    // 신청하면 개설자에게 알림이 가므로 확인을 받음
                    <form action={enrollProjectAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <input type="hidden" name="back" value="surveys" />
                      <ConfirmButton
                        message={`"${p.title}"에 참여 신청합니다.\n\n· 개설자에게 신청 알림이 갑니다.\n· 선발되면 알림으로 알려드립니다. 모집 중에는 스스로 취소할 수 있습니다.`}
                        confirmLabel="참여 신청"
                        pendingText="신청 중…"
                        className={`${btn} bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]`}
                      >
                        신청하기
                      </ConfirmButton>
                    </form>
                  ) : canAnswer ? (
                    <Link href={`/dashboard?view=eval&p=${p.id}`} className={`${btn} bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]`}>
                      응답하기
                    </Link>
                  ) : (
                    <span className={`${btn} bg-[var(--gray-100)] text-[var(--gray-600)]`}>{chip}</span>
                  )}
                </li>
              );
            })}
            {versions.map((v) => {
              const done = v.responses.length > 0;
              // 공개된 회차는 결제된 발주가 있음(legacySurveyWhere). 보상액을 표시함
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
                        {[reward, v.service.preset || null].filter(Boolean).join(" · ") || "평가"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-[var(--radius-md)] ${
                        done ? "bg-[var(--gray-100)] text-[var(--gray-600)]" : "bg-[var(--accent)] text-white"
                      }`}
                    >
                      {done ? "응답 완료" : "응답하기"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {participated.length > 0 && (
          <section id="participated" aria-labelledby="participated-h" className="scroll-mt-20 bg-white rounded-[var(--radius-xl)] px-5 pt-5">
            <h2 id="participated-h" className="text-[17px] font-bold text-[var(--foreground)]">
              참여한 평가 ({participated.length})
            </h2>
            <ul className="divide-y divide-[var(--gray-100)]">
              {participated.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard?view=detail&p=${p.id}`}
                    className="flex items-center gap-3 py-4 -mx-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">{p.title}</span>
                      <span className="block text-sm text-[var(--muted)] mt-0.5">
                        {p.startTime.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" })}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.status === "FINISHED"
                          ? "bg-[var(--gray-100)] text-[var(--gray-600)]"
                          : "bg-[var(--success-light)] text-[var(--success)]"
                      }`}
                    >
                      {p.status === "FINISHED" ? "종료" : "진행 중"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
