import Link from "next/link";
import { prisma } from "@/app/db";
import { scenarioScope, scenarioViewer } from "./access";
import { ui } from "@/app/components/ui";
import { statusMeta } from "@/app/lib/projectStatus";

export const metadata = { title: "동행 평가" };

export default async function AccompanyPage() {
  const user = await scenarioViewer();
  const projects = await prisma.project.findMany({
    where: {
      AND: [
        scenarioScope(user),
        { evalMode: "ACCOMPANY" },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      creatorId: true,
      status: true,
      scenario: {
        select: {
          publishedAt: true,
        },
      },
    },
  });
  const canCreate = user.role === "ADMIN" || user.role === "DEVELOPER";
  return (
    <main className="mx-auto w-full max-w-[900px] space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold">동행 평가</h1>
      {!projects.length && (
        <div className={`${ui.panel} space-y-4`}>
          <p>{canCreate ? "평가를 만든 뒤 이곳에서 학생에게 줄 과제를 작성할 수 있어요." : "모집 중인 평가에 신청하세요. 선발된 평가가 시작되면 여기서 과제를 열 수 있어요."}</p>
          <Link className={ui.primary} href={canCreate ? "/dashboard/services" : "/dashboard/surveys"}>
            {canCreate ? "평가 만들기" : "모집 중인 평가 찾기"}
          </Link>
        </div>
      )}
      {projects.length > 0 && <ul className="divide-y divide-[var(--gray-100)] overflow-hidden rounded-[var(--radius-xl)] bg-white">
        {projects.map((p) => {
          const manager = user.role === "ADMIN" || p.creatorId === user.id;
          let label = manager ? "학생 기록과 의견 보기" : "내 과제 열기";
          if (p.status === "FINISHED") label = "평가 기록 보기";
          else if (!p.scenario) label = "Evi와 과제 정하기";
          else if (!p.scenario.publishedAt) label = "과제 내용 검토";
          else if (manager && p.status === "RECRUITING") label = "참여 학생 선발";
          return (
            <li key={p.id}>
              <Link
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--gray-50)]"
                href={`/dashboard/accompany/${p.id}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`${ui.badge} shrink-0 ${statusMeta(p.status).cls}`}>{statusMeta(p.status).label}</span>
                  <strong className="min-w-0 break-words">{p.title}</strong>
                </span>
                <span className="text-sm font-semibold text-[var(--accent)]">
                  {label} <span aria-hidden="true">›</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>}
    </main>
  );
}
