import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/db";
import { logPersonalData } from "@/app/lib/accessLog";
import { nextPhase, checkItems } from "@/app/lib/scenario";
import ConfirmButton from "@/app/components/ConfirmButton";
import { scenarioScope, scenarioViewer } from "./access";
import { saveScenario } from "./actions";
import QuestChat from "./QuestChat";
import ServiceSplit from "./ServiceSplit";
import HubDock from "./HubDock";
import BriefInterview from "./BriefInterview";
import ManagerBoard, { managerTabs, type ManagerTab } from "./ManagerBoard";
import StudentRecords from "./StudentRecords";
import { ui } from "@/app/components/ui";
import { statusMeta } from "@/app/lib/projectStatus";
import { parseProjectGuides } from "@/app/lib/projectGuides";
import { ProjectGuidesList } from "@/app/components/ProjectGuidesField";
import { CreateNav } from "../services/CreateShell";

export default async function ProjectTask({ projectId, error, saved, tab }: {
  projectId: string;
  error?: string;
  saved?: string;
  tab?: string;
}) {
  const user = await scenarioViewer();
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...scenarioScope(user) },
    select: {
      title: true,
      creatorId: true,
      status: true,
      evalMode: true,
      closedAt: true,
      link: true,
      guides: true,
      scenario: { include: { releases: { orderBy: { phase: "asc" } } } },
    },
  });
  if (!project || project.evalMode !== "ACCOMPANY") notFound();
  const manager = user.role === "ADMIN" || project.creatorId === user.id;
  const brief = project.scenario;
  const rows = brief?.publishedAt
    ? await prisma.scenarioReading.findMany({
        where: { projectId, ...(manager ? {} : { userId: user.id }) },
        include: { requests: { orderBy: [{ requestedAt: "asc" }, { id: "asc" }] } },
        omit: { transcript: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  if (manager && rows.length)
    await logPersonalData(user.id, "VIEW", "동행 평가 측정 기록 및 의견 조회");
  const latest = brief?.releases.at(-1)?.phase ?? 1;
  const phase = nextPhase(
    rows.map((r) => r.phase),
    latest,
    project.status === "ACTIVE" && !project.closedAt,
  );
  const running =
    !manager && phase !== null && phase > 0
      ? await prisma.scenarioTask.findUnique({
          where: { projectId_userId_phase: { projectId, userId: user.id, phase } },
          select: { incident: true },
        })
      : null;
  const link = project.link && /^https?:\/\//i.test(project.link) ? project.link : null;
  let host = "";
  try { host = link ? new URL(link).host : ""; } catch {}
  const drafting = !brief?.publishedAt && manager && project.status !== "FINISHED";
  const current = !rows.some((r) => r.phase === 0) ? 0 : !rows.some((r) => r.phase === 1) ? 1 : 2;
  const steps = ["출발 전 질문", "과제 진행", "결과 확인"];
  const chat = brief?.publishedAt && !manager && (
    <QuestChat
      key={`${user.id}-${projectId}-${phase}-${Boolean(running)}`}
      userId={user.id}
      projectId={projectId}
      briefKey={String(brief.publishedAt.getTime())}
      phase={phase}
      running={Boolean(running)}
      task={brief.task}
      items={checkItems(brief.metric)}
      unit={brief.unit}
      link={link}
      incident={running?.incident ?? null}
      readingId={phase === null ? rows.filter((r) => r.phase > 0).at(-1)?.id ?? null : null}
    />
  );
  const activeTab: ManagerTab = managerTabs.some((t) => t === tab) ? (tab as ManagerTab) : "results";

  return (
    <main className={`mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 sm:px-6 ${chat || drafting ? "lg:pr-[460px]" : ""}`}>
      <header className="space-y-3">
        {/* 작성 중인 동행 평가는 평가 상세가 아직 없어 만들기 단계 표시로 대신함 */}
        {project.status === "DRAFT" && manager ? (
          <CreateNav method="accompany" step={2} />
        ) : (
          <Link href={`/dashboard?view=detail&p=${projectId}`} className={ui.back}>
            <span aria-hidden="true">←</span> 평가 상세
          </Link>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="break-words text-xl font-bold">{project.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <span className={`${ui.badge} ${statusMeta(project.status).cls}`}>{statusMeta(project.status).label}</span>
              {drafting && project.status !== "DRAFT" && <span className={`${ui.badge} bg-[var(--gray-100)] text-[var(--gray-700)]`}>{brief ? "과제 공개 전" : "과제 작성 중"}</span>}
              {brief?.publishedAt && <span className={`${ui.badge} bg-[var(--accent-light)] text-[var(--accent)]`}>{brief.releases.at(-1)?.version ?? brief.version}</span>}
              {host && <a href={link!} target="_blank" rel="noreferrer" className="hover:text-[var(--foreground)] hover:underline">{host}</a>}
            </div>
          </div>
          {!manager && brief?.publishedAt && latest === 1 && (
            <ol aria-label="진행 단계" className="flex items-center gap-2 text-sm">
              {steps.map((label, i) => {
                const done = i < current || phase === null;
                const now = i === current && phase !== null;
                return (
                  <li key={label} aria-current={now ? "step" : undefined} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true" className={`h-px w-4 sm:w-6 ${done || now ? "bg-[var(--accent)]" : "bg-[var(--gray-300)]"}`} />}
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-[var(--accent)] text-white" : now ? "bg-white text-[var(--accent)] ring-2 ring-[var(--accent)]" : "bg-[var(--gray-200)] text-[var(--gray-700)]"}`}>
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={`hidden sm:inline ${now ? "font-semibold" : "text-[var(--muted)]"}`}>{label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-[var(--radius-lg)] bg-white px-4 py-3 text-sm text-[var(--danger)]">
          {error === "changed" ? "기록이 바뀌었어요. 화면을 새로고침한 뒤 다시 시도해 주세요." : error === "brief" ? "과제 내용을 먼저 저장해 주세요." : "입력한 내용을 다시 확인해 주세요."}
        </p>
      )}
      {saved && !error && manager && <p role="status" className="text-sm text-[var(--muted)]">{saved === "published" ? "학생에게 공개했어요. 선발된 학생에게 알림을 보냈어요." : saved === "published-wait" ? "학생에게 공개했어요. 아직 모집 중이라 평가를 시작하면 선발된 학생에게 알려요." : saved === "draft" ? "평가 대상을 정했어요. 이제 Evi와 학생에게 줄 과제를 정해요." : saved === "requested" ? "승인을 요청했어요. 관리자가 승인하면 모집이 시작돼요." : saved === "created" ? "승인을 요청했어요. 승인을 기다리는 동안 Evi와 과제를 정리해 주세요." : "저장했어요."}</p>}

      {manager && !brief?.publishedAt && project.status === "FINISHED" && (
        <p className={`${ui.panel} text-sm`}>과제를 학생에게 공개하지 않고 종료한 평가라 기록이 없어요.</p>
      )}

      {drafting && (
        <BriefInterview projectId={projectId} title={project.title} revision={brief?.revision ?? 0} initial={brief ? {
          description: brief.description, task: brief.task, outcome: brief.outcome, metric: brief.metric,
          unit: brief.unit, version: brief.version, direction: brief.lowerBetter ? "lower" : "higher",
        } : null} publish={brief && user.role === "ADMIN" && ["ACTIVE", "RECRUITING"].includes(project.status) ? (
          <form action={saveScenario.bind(null, projectId)}>
            <input type="hidden" name="op" value="publish" />
            <input type="hidden" name="revision" value={brief.revision} />
            <ConfirmButton className={ui.primary} message="학생에게 공개할까요? 공개하면 과제와 완료 조건이 고정돼요.">
              학생에게 공개
            </ConfirmButton>
          </form>
        ) : null} next={project.status === "DRAFT" ? (
          <div className={`${ui.panel} space-y-3`}>
            <p className="text-sm leading-relaxed">과제를 정했어요. 이제 모집 일정과 비용 처리를 정해 승인을 요청해 주세요.</p>
            <Link href={`/dashboard/accompany/${projectId}/recruit`} className={`${ui.primary} w-full`}>다음: 모집·비용 정하기</Link>
          </div>
        ) : undefined} />
      )}

      {brief?.publishedAt && manager && (
        <ManagerBoard projectId={projectId} brief={brief} rows={rows} latest={latest} tab={activeTab}
          admin={user.role === "ADMIN"} recruiting={project.status === "RECRUITING"} inbox={project.creatorId === user.id} />
      )}

      {brief?.publishedAt && !manager && (
        <div className="space-y-6">
          <ProjectGuidesList guides={parseProjectGuides(project.guides)} />
          {running && link && <ServiceSplit projectId={projectId} link={link} />}
          <HubDock title={project.title} subtitle="과제를 함께 진행해요">{chat}</HubDock>
          {phase !== 1 && <StudentRecords projectId={projectId} brief={brief} rows={rows} latest={latest} link={link} />}
        </div>
      )}
    </main>
  );
}
