import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { prisma } from "../db";
import { maskStudentId } from "../lib/privacy";
import DashboardView, { type DashboardProject } from "./DashboardView";
import type { LinkableOrder } from "./FundingFields";
import { linkableOrdersFor } from "./linkableOrders";
import ProjectTask from "./accompany/ProjectTask";
import MyRewardsPanel, { type MyRewardSummary } from "./MyRewardsPanel";
import { getSettlementProfile } from "../lib/settlementProfile";
import { visibleProjectWhere, capacityOf, rewardPerPersonOf, isPayerUs } from "../lib/approvals";
import { getQuoteSupplier } from "../lib/orgSettings";
import { getPlatformStats } from "../lib/platformStats";
import { manwonText } from "../lib/money";
import { nextPhase } from "../lib/scenario";
import { parseProjectGuides } from "../lib/projectGuides";

export const metadata = { title: "대시보드" };

/**
 * 대시보드 첫 화면. 맨 위에 「지금 할 일」(응답할 평가, 선발 대기, 운영할 평가)을 두고
 * 평가 일정은 그 아래에 보여줌
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    p?: string;
    error?: string;
    saved?: string;
    tab?: string;
    submitted?: string;
    answered?: string;
    invalid?: string;
    full?: string;
  }>;
}) {
  // 「지금 할 일」과 좌측 목록은 목록·상세 화면에서만 보임
  const { view, p: selectedId, error, saved, tab, submitted, answered: answeredParam, invalid, full } = await searchParams;
  // 저장해 둔 옛 주소
  if (view === "create-choose") redirect("/dashboard/services");
  const focus = !!view && view !== "list" && view !== "detail";
  const userId = await getSessionUserId();
  // 응답 화면 등에서 만료되면 다시 로그인한 뒤 같은 화면으로 돌아오게 함
  const here = `/dashboard${view ? `?view=${encodeURIComponent(view)}${selectedId ? `&p=${encodeURIComponent(selectedId)}` : ""}` : ""}`;
  if (!userId) redirectToLogin(here);

  const userRaw = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      studentId: true,
      name: true,
      role: true,
      userType: true,
      major: true,
      phone: true,
      email: true,
      profileImage: true,
      responses: {
        select: { project: { select: { id: true, title: true, status: true, startTime: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!userRaw) redirectToLogin(here);

  // 참여한 평가 목록 (중복 제거)
  const seenProjectIds = new Set<string>();
  const participatedProjects: { id: string; title: string; status: string; startTime: string }[] = [];
  for (const r of userRaw.responses || []) {
    const p = r.project;
    if (!p || seenProjectIds.has(p.id)) continue;
    seenProjectIds.add(p.id);
    participatedProjects.push({
      id: p.id,
      title: p.title,
      status: p.status,
      startTime: p.startTime.toISOString(),
    });
  }

  const safeUser = {
    id: userRaw.id,
    studentId: userRaw.studentId,
    name: userRaw.name,
    role: userRaw.role,
    userType: userRaw.userType || "STUDENT",
    major: userRaw.major || "",
    phone: userRaw.phone || "",
    email: userRaw.email || "",
    profileImage: userRaw.profileImage || null,
    participatedProjects,
  };

  // 비관리자에게는 다른 사용자 학번을 앞 4자리까지만 노출
  const isAdmin = safeUser.role === "ADMIN";
  if (view === "task" && selectedId) return <ProjectTask projectId={selectedId} error={error} saved={saved} tab={tab} />;
  // 동행 평가의 결과는 대화 기록과 함께 과제 화면에서 봄
  if (view === "result" && selectedId) {
    const accompany = await prisma.project.findFirst({
      where: { id: selectedId, evalMode: "ACCOMPANY", ...(isAdmin ? {} : { creatorId: userId }) },
      select: { id: true },
    });
    if (accompany) return <ProjectTask projectId={selectedId} error={error} saved={saved} tab={tab} />;
  }
  // 동행 평가에는 설문 화면이 없음. 과제가 공개되기 전이면 평가 상세로 돌려보냄
  if (view === "eval" && selectedId && !isAdmin) {
    const accompany = await prisma.project.findFirst({
      where: { id: selectedId, evalMode: "ACCOMPANY" },
      select: { creatorId: true, scenario: { select: { publishedAt: true } }, enrollments: { where: { userId, status: "ACCEPTED" }, select: { id: true } } },
    });
    if (accompany) {
      if (accompany.scenario?.publishedAt && accompany.creatorId !== userId && accompany.enrollments.length)
        return <ProjectTask projectId={selectedId} error={error} saved={saved} tab={tab} />;
      redirect(`/dashboard?view=detail&p=${selectedId}`);
    }
  }

  // 공개되지 않은 평가는 서버 쿼리에서 거름. 개설자는 자기 평가를 승인 전에도 볼 수 있음
  const projectWhere = isAdmin ? {} : { OR: [visibleProjectWhere, { creatorId: safeUser.id }] };
  const responseInclude = {
    include: { user: { select: { id: true, name: true, studentId: true } } },
    orderBy: { createdAt: "asc" as const },
  };
  const enrollmentInclude = {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          studentId: true,
          major: true,
          // 과거 참여 횟수(선발 참고용)
          _count: { select: { responses: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  };

  // 목록에는 요약과 본인 행만 실음. 문항·명단·응답 내용은 연 평가 1건만 아래에서 읽음
  const [projectsRaw, acceptedRows, opened] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      omit: { questions: true },
      include: {
        responses: { ...responseInclude, where: { userId: safeUser.id } },
        enrollments: { ...enrollmentInclude, where: { userId: safeUser.id } },
        creator: {
          select: { id: true, name: true, studentId: true, major: true, userType: true, role: true },
        },
        // 발주가 있으면 정원·보상 단가는 발주 값을 씀(capacityOf 와 같은 기준).
        order: { select: { panelSize: true, rewardPerPerson: true } },
        _count: { select: { responses: true, enrollments: true } },
        scenario: { select: { publishedAt: true } },
      },
      orderBy: { startTime: "desc" },
    }),
    prisma.enrollment.groupBy({ by: ["projectId"], where: { status: "ACCEPTED" }, _count: { _all: true } }),
    selectedId
      ? prisma.project.findFirst({
          where: { id: selectedId, ...projectWhere },
          select: {
            id: true,
            creatorId: true,
            questions: true,
            scenario: { select: { publishedAt: true } },
            responses: responseInclude,
            enrollments: enrollmentInclude,
          },
        })
      : null,
  ]);
  const acceptedBy = new Map(acceptedRows.map((r) => [r.projectId, r._count._all]));

  const safeProjects = projectsRaw.map((p): DashboardProject => {
    // 다른 학생의 응답·신청 명단은 개설자와 ADMIN 에게만 보냄. 나머지는 본인 것과 인원 수만.
    const isOpened = opened?.id === p.id;
    const full = isOpened && (isAdmin || p.creatorId === safeUser.id);
    const responses = full ? opened.responses : p.responses;
    const enrollments = full ? opened.enrollments : p.enrollments;
    return {
    id: p.id,
    evalMode: p.evalMode === "ACCOMPANY" ? "ACCOMPANY" : "SURVEY",
    questionSource: p.questionSource === "AUTO" ? "AUTO" : "MANUAL",
    hasOrder: !!p.order,
    needsOrder: isPayerUs(p.fundingType) && !p.order,
    taskStatus: isOpened && opened.scenario
      ? (opened.scenario.publishedAt && (full || (p.status !== "RECRUITING" && p.enrollments.some(e => e.status === "ACCEPTED"))) ? "published" : full ? "draft" : null)
      : null,
    title: p.title,
    description: p.description,
    location: p.location,
    status: p.status,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime?.toISOString() || null,
    closedAt: p.closedAt?.toISOString() || null,
    questions: (isOpened ? opened.questions : []) as unknown as DashboardProject["questions"],
    guides: parseProjectGuides(p.guides),
    link: p.link,
    creatorId: p.creatorId,
    creatorName: p.creator?.name || null,
    creatorMajor: p.creator?.major || null,
    creatorUserType: p.creator?.userType || null,
    minParticipants: p.minParticipants,
    maxParticipants: p.maxParticipants,
    capacity: capacityOf(p),
    // 보상액은 플랫폼이 지급하는 건에만 표시함(surveys/page.tsx 와 같은 규칙).
    rewardPerPerson: isPayerUs(p.fundingType) ? rewardPerPersonOf(p) : 0,
    // 반려 건은 개설자·관리자에게만 내려옴(where).
    rejectReason: p.status === "REJECTED" ? p.rejectReason : null,
    enrollmentDeadline: p.enrollmentDeadline?.toISOString() || null,
    responseCount: p._count.responses,
    enrollmentCount: p._count.enrollments,
    acceptedCount: acceptedBy.get(p.id) ?? 0,
    responses: responses.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name || null,
      userStudentId: maskStudentId(r.user?.studentId, isAdmin),
      answers: r.answers as DashboardProject["responses"][number]["answers"],
    })),
    enrollments: enrollments.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.user.name,
      userStudentId: maskStudentId(e.user.studentId, isAdmin),
      userMajor: e.user.major || "",
      userResponseCount: e.user._count.responses,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
    };
  });

  // 내 보상. 유료 평가에 응답하면 Reward 가 생김
  // 계좌를 미리 입력할 수 있도록 보상이 없어도 패널은 보여줌
  const myRewards = await prisma.reward.findMany({
    where: { userId: safeUser.id },
    select: { status: true, grossAmount: true, netAmount: true, taxAmount: true },
  });

  const bucket = (pick: (s: string) => boolean, amount: (r: (typeof myRewards)[number]) => number) => {
    const rows = myRewards.filter((r) => pick(r.status));
    return { count: rows.length, amount: rows.reduce((s, r) => s + amount(r), 0) };
  };

  // 보상이 없으면 요약은 null 임
  const myRewardSummary: MyRewardSummary | null =
    myRewards.length === 0
      ? null
      : {
          reviewing: bucket((s) => s === "PENDING", (r) => r.grossAmount),
          // FAILED(이체 실패)도 아직 받을 돈이라 지급 예정에 함께 넣음
          upcoming: bucket((s) => s === "APPROVED" || s === "FAILED", (r) => r.netAmount),
          paid: bucket((s) => s === "PAID", (r) => r.netAmount),
          rejected: myRewards.filter((r) => r.status === "REJECTED").length,
          taxTotal: myRewards
            .filter((r) => r.status !== "REJECTED")
            .reduce((s, r) => s + r.taxAmount, 0),
        };

  const myProfile = await getSettlementProfile(safeUser.id);
  // 문의 전화번호는 코드에 두지 않고 조직 설정(연락처)에서 읽음
  const { contact } = await getQuoteSupplier();
  // 실적은 첫 화면 머리에만 보임
  const stats = focus ? null : await getPlatformStats();
  const statsLine = stats
    ? `지금까지 평가 ${stats.rounds}회 · ${stats.people}명 참여 · 참여 보상 ${manwonText(stats.paidTotal)} 지급`
    : "";

  // DEVELOPER/ADMIN: 자동 생성용 확정 설문 서비스 목록
  let confirmedServices: { id: string; name: string; versionId: string }[] = [];
  let linkableOrders: LinkableOrder[] = [];
  if (safeUser.role === "DEVELOPER" || safeUser.role === "ADMIN") {
    const svcs = await prisma.service.findMany({
      where: {
        ...(safeUser.role !== "ADMIN" ? { ownerId: safeUser.id } : {}),
        surveys: { some: { status: "CONFIRMED" } },
      },
      include: {
        surveys: {
          where: { status: "CONFIRMED" },
          orderBy: { round: "desc" },
          take: 1,
        },
      },
    });
    confirmedServices = svcs
      .filter((s) => s.surveys.length > 0)
      .map((s) => ({ id: s.id, name: s.name, versionId: s.surveys[0].id }));

    linkableOrders = await linkableOrdersFor(safeUser);
  }

  // 동행 평가 개선판 재평가가 열렸는데 아직 하지 않은 평가. 응답은 이미 있어 toRespond 에 잡히지 않음
  const retests = (
    await prisma.scenarioBrief.findMany({
      where: { publishedAt: { not: null }, readings: { some: { userId: safeUser.id, phase: 1 } } },
      select: {
        projectId: true,
        project: { select: { title: true } },
        releases: { orderBy: { phase: "desc" }, take: 1, select: { phase: true, version: true } },
        readings: { where: { userId: safeUser.id }, select: { phase: true } },
      },
    })
  ).filter((b) => nextPhase(b.readings.map((r) => r.phase), b.releases[0]?.phase ?? 1, true) != null);
  // 내 요청이 최신 개선판에 반영됐는데 고쳐졌는지 아직 확인하지 않은 평가. 재평가 대화를 마쳐도 남음(확인은 최신판만 가능)
  const pendingChecks = await prisma.scenarioRequest.findMany({
    where: { userId: safeUser.id, deployedPhase: { not: null }, recheckedAt: null },
    select: { projectId: true, deployedPhase: true, reading: { select: { brief: { select: { releases: { orderBy: { phase: "desc" }, take: 1, select: { phase: true } } } } } } },
  });
  const rechecks = [...pendingChecks
    .filter((r) => r.deployedPhase === r.reading.brief.releases[0]?.phase)
    .reduce((m, r) => m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1), new Map<string, number>())]
    .map(([projectId, count]) => ({ projectId, count }));

  // 지금 할 일
  const myEnrollment = (p: (typeof safeProjects)[number]) => p.enrollments.find((e) => e.userId === safeUser.id);
  const answered = (p: (typeof safeProjects)[number]) => p.responses.some((r) => r.userId === safeUser.id);
  // 동행 평가의 과제 작성(brief)·공개 여부. 학생은 공개된 과제만 할 수 있음
  const briefOf = new Map(projectsRaw.map((p) => [p.id, p.scenario]));
  const taskOpen = (p: { id: string }) => !!briefOf.get(p.id)?.publishedAt;

  // 선발됐고 진행 중인데 아직 응답하지 않은 평가
  const toRespond = safeProjects.filter(
    (p) => p.status === "ACTIVE" && myEnrollment(p)?.status === "ACCEPTED" && !answered(p)
      && (p.evalMode === "SURVEY" || taskOpen(p)),
  );
  // 선발돼 평가가 시작됐지만 운영진이 아직 과제를 공개하지 않은 동행 평가
  const preparing = safeProjects.filter(
    (p) => p.status === "ACTIVE" && p.evalMode === "ACCOMPANY" && myEnrollment(p)?.status === "ACCEPTED" && !taskOpen(p),
  );
  const titleOf = new Map(safeProjects.map((p) => [p.id, p.title]));
  // 신청하고 선발 결과를 기다리는 평가
  const awaiting = safeProjects.filter(
    (p) => p.status === "RECRUITING" && !!myEnrollment(p) && myEnrollment(p)?.status !== "REMOVED",
  );
  // 개설자(본인 것)·관리자(전체)의 운영 할 일
  const mine = safeProjects.filter((p) => isAdmin || p.creatorId === safeUser.id);
  const myPending = mine.filter((p) => p.status === "PENDING_APPROVAL" && (!isAdmin || p.creatorId === safeUser.id));
  const myRejected = mine.filter((p) => p.status === "REJECTED" && p.creatorId === safeUser.id);
  const toSelect = mine.filter((p) => p.status === "RECRUITING" && p.enrollmentCount > 0);
  // 본인이 연 진행 중 평가. 응답이 얼마나 들어왔는지 첫 화면에서 보이게 함
  const myActive = mine.filter((p) => p.status === "ACTIVE" && p.creatorId === safeUser.id);
  // 기업·교육기관 건인데 의뢰가 없어 보상이 생기지 않는 본인 평가. 의뢰 화면에서 연결함
  const noOrder = mine.filter((p) => p.creatorId === safeUser.id && p.needsOrder && ["PENDING_APPROVAL", "RECRUITING", "ACTIVE"].includes(p.status));
  // 본인 동행 평가에 아직 답하지 않은 개선 요청(종료한 평가 포함, 종료 뒤에도 요청이 들어옴)
  const toReply = safeUser.role === "DEVELOPER" || isAdmin
    ? await prisma.scenarioRequest.groupBy({
        by: ["projectId"],
        where: { repliedAt: null, note: { not: "" }, reading: { brief: { project: { creatorId: safeUser.id } } } },
        _count: { _all: true },
      })
    : [];
  // 관리자는 다른 개설자의 승인 요청도 처리해야 하므로 승인 화면 바로가기를 맨 앞에 둠
  const toApprove = isAdmin ? safeProjects.filter((p) => p.status === "PENDING_APPROVAL") : [];
  // 동행 평가 중 과제 인터뷰를 아직 안 한 본인 평가, 과제는 있는데 아직 공개하지 않은 평가(관리자)
  const toBrief = mine.filter((p) => p.evalMode === "ACCOMPANY" && p.creatorId === safeUser.id
    && !briefOf.get(p.id) && p.status !== "FINISHED" && p.status !== "REJECTED");
  // 과제는 정했지만 아직 승인을 요청하지 않은 작성 중 동행 평가
  const toRecruit = mine.filter((p) => p.status === "DRAFT" && p.creatorId === safeUser.id && !!briefOf.get(p.id));
  const toPublish = isAdmin
    ? safeProjects.filter((p) => p.evalMode === "ACCOMPANY" && briefOf.get(p.id) && !taskOpen(p)
        && (p.status === "RECRUITING" || p.status === "ACTIVE"))
    : [];
  const upcomingReward = (myRewardSummary?.upcoming.amount ?? 0) + (myRewardSummary?.reviewing.amount ?? 0);

  type Task = { key: string; tone: "primary" | "warn" | "info" | "danger"; title: string; desc: string; href: string; cta: string };
  const tasks: Task[] = [
    ...(toApprove.length > 0
      ? [{
          key: "approve",
          tone: "warn" as const,
          title: `승인 대기 평가 ${toApprove.length}건`,
          desc: "내용을 확인하고 승인하거나 반려해 주세요",
          href: "/dashboard/approvals",
          cta: "검토하기",
        }]
      : []),
    ...toRespond.map((p) => p.evalMode === "ACCOMPANY" ? {
      key: `r-${p.id}`,
      tone: "primary" as const,
      title: p.title,
      desc: "선발됐어요 · Evi와 과제를 진행해 주세요",
      href: `/dashboard?view=task&p=${p.id}`,
      cta: "과제 시작",
    } : {
      key: `r-${p.id}`,
      tone: "primary" as const,
      title: p.title,
      desc: "선발됐어요 · 응답해 주세요",
      href: `/dashboard?view=eval&p=${p.id}`,
      cta: "응답하기",
    }),
    ...toPublish.map((p) => ({
      key: `o-${p.id}`,
      tone: "warn" as const,
      title: p.title,
      desc: "Evi 과제가 정리됐어요 · 확인하고 학생에게 공개해 주세요",
      href: `/dashboard?view=task&p=${p.id}`,
      cta: "공개하기",
    })),
    ...toRecruit.map((p) => ({
      key: `d-${p.id}`,
      tone: "warn" as const,
      title: p.title,
      desc: "과제를 정했어요 · 모집·비용을 정해 승인을 요청해 주세요",
      href: `/dashboard/accompany/${p.id}/recruit`,
      cta: "이어서",
    })),
    ...toBrief.map((p) => ({
      key: `b-${p.id}`,
      tone: "warn" as const,
      title: p.title,
      desc: "Evi와 학생 과제를 정해 주세요",
      href: `/dashboard?view=task&p=${p.id}`,
      cta: "작성하기",
    })),
    ...retests.map((b) => ({
      key: `t-${b.projectId}`,
      tone: "primary" as const,
      title: b.project.title,
      desc: `${b.releases[0]?.version ?? "새 버전"} 개선판 재평가 · 고쳐졌는지 확인해 주세요`,
      href: `/dashboard?view=task&p=${b.projectId}`,
      cta: "재평가",
    })),
    ...rechecks.filter((r) => !retests.some((b) => b.projectId === r.projectId)).map((r) => ({
      key: `k-${r.projectId}`,
      tone: "primary" as const,
      title: titleOf.get(r.projectId) ?? "동행 평가",
      desc: `내 요청 ${r.count}건이 반영됐어요 · 고쳐졌는지 확인해 주세요`,
      href: `/dashboard?view=task&p=${r.projectId}`,
      cta: "확인하기",
    })),
    ...preparing.map((p) => ({
      key: `w-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: "선발됐어요 · Evi 과제를 준비하고 있어요",
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "보기",
    })),
    ...myRejected.map((p) => ({
      key: `x-${p.id}`,
      tone: "danger" as const,
      title: p.title,
      desc: p.rejectReason ? `반려 · ${p.rejectReason}` : "반려됐어요 · 고쳐서 다시 요청해 주세요",
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "확인",
    })),
    ...toSelect.map((p) => ({
      key: `s-${p.id}`,
      tone: "warn" as const,
      title: p.title,
      desc: `신청 ${p.enrollmentCount}명 · 정원 ${p.capacity}명`,
      href: `/dashboard?view=recruit&p=${p.id}`,
      cta: "선발하기",
    })),
    ...toReply.map((r) => ({
      key: `q-${r.projectId}`,
      tone: "warn" as const,
      title: titleOf.get(r.projectId) ?? "동행 평가",
      desc: `답할 개선 요청 ${r._count._all}건`,
      href: `/dashboard?view=task&p=${r.projectId}&tab=requests`,
      cta: "답하기",
    })),
    ...myActive.map((p) => p.evalMode === "ACCOMPANY" ? {
      key: `g-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: taskOpen(p) ? `진행 중 · 기록 ${p.responseCount}/${p.acceptedCount}명` : "진행 중 · 운영진이 과제 공개를 확인하고 있어요",
      href: `/dashboard?view=task&p=${p.id}`,
      cta: "현황",
    } : {
      key: `g-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: `진행 중 · 응답 ${p.responseCount}/${p.acceptedCount}명`,
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "현황",
    }),
    ...awaiting.map((p) => ({
      key: `a-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: "선발 결과를 기다리는 중",
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "보기",
    })),
    ...noOrder.map((p) => ({
      key: `n-${p.id}`,
      tone: "warn" as const,
      title: p.title,
      desc: "평가 의뢰 미연결 · 학생 참여 보상이 생기지 않아요",
      href: "/dashboard/orders",
      cta: "의뢰하기",
    })),
    ...myPending.filter((p) => !toBrief.includes(p)).map((p) => ({
      key: `p-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: "관리자 승인을 기다리는 중",
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "보기",
    })),
  ];
  const TASK_PREVIEW = 4;

  // 오른쪽에는 모집 중인 평가만 둠(진행 중·종료는 일정 목록에 있음).
  const recruitingProjects = safeProjects.filter((p) => p.status === "RECRUITING");
  const RECRUIT_PREVIEW = 5;
  const myChip = (p: (typeof safeProjects)[number]): string | null => {
    if (answered(p)) return "응답 완료";
    const e = myEnrollment(p);
    if (!e || e.status === "REMOVED") return null;
    return "신청함";
  };
  const recruitSub = (p: (typeof safeProjects)[number]) =>
    [
      p.rewardPerPerson > 0 ? `${p.rewardPerPerson.toLocaleString("ko-KR")}원` : null,
      p.enrollmentDeadline
        ? `${new Date(p.enrollmentDeadline).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" })} 마감`
        : null,
      `${p.enrollmentCount}/${p.capacity}명 신청`,
    ]
      .filter(Boolean)
      .join(" · ");

  // 평가를 여는 사람(기업·교수·관리자)은 실적 숫자를, 학생은 참여 숫자와 실적 한 줄을 봄
  const isMaker = safeUser.role === "DEVELOPER" || isAdmin;
  const running = mine.filter((p) => p.status === "RECRUITING" || p.status === "ACTIVE");
  const summaryLine =
    (isMaker
      ? [toApprove.length > 0 ? `승인 대기 ${toApprove.length}건` : myPending.length > 0 ? `승인 기다리는 평가 ${myPending.length}건` : null, running.length > 0 ? `운영 중 ${running.length}건` : null, toSelect.length > 0 ? `선발할 평가 ${toSelect.length}건` : null]
      : [toRespond.length > 0 ? `응답할 평가 ${toRespond.length}건` : null, retests.length + rechecks.length > 0 ? `재평가·확인 ${new Set([...retests.map((b) => b.projectId), ...rechecks.map((r) => r.projectId)]).size}건` : null, awaiting.length > 0 ? `결과 대기 ${awaiting.length}건` : null]
    )
      .filter(Boolean)
      .join(" · ") || "지금 처리할 일은 없어요";
  const heroStats: { label: string; value: string; href?: string }[] = isMaker
    ? stats
      ? [
          { label: "진행한 평가", value: `${stats.rounds}회` },
          { label: "참여 보상 지급", value: manwonText(stats.paidTotal) },
          { label: "참여 인원", value: `${stats.people}명` },
        ]
      : []
    : [
        { label: "응답 대기", value: `${toRespond.length}건` },
        { label: "참여한 평가", value: `${participatedProjects.length}건`, href: participatedProjects.length ? "/dashboard/surveys#participated" : undefined },
        { label: "받을 보상", value: `${upcomingReward.toLocaleString("ko-KR")}원` },
      ];
  // 보상을 받은 적 없는 개설자에게는 계좌 안내가 필요 없음
  const showRewards = !isMaker || myRewardSummary !== null;

  const recruitSection = (
    <section aria-labelledby="recruit-h" className="bg-white rounded-[var(--radius-xl)] p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 id="recruit-h" className="text-[17px] font-bold text-[var(--foreground)]">
          모집 중
        </h2>
        <Link href="/dashboard/surveys" className="text-sm text-[var(--gray-600)] hover:text-[var(--foreground)]">
          전체보기
        </Link>
      </div>
      {recruitingProjects.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-4">모집 중인 평가가 없어요.</p>
      ) : (
        <ul className="divide-y divide-[var(--gray-100)]">
          {recruitingProjects.slice(0, RECRUIT_PREVIEW).map((p) => {
            const chip = myChip(p);
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard?view=detail&p=${p.id}`}
                  scroll={false}
                  className="block py-3 -mx-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-medium text-[var(--foreground)] truncate">{p.title}</span>
                    {chip && (
                      <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{chip}</span>
                    )}
                  </span>
                  <span className="block text-[13px] text-[var(--muted)] mt-0.5 truncate">{recruitSub(p)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="bg-[var(--surface)] flex flex-col min-h-full">
      {!focus && (
        <section className="relative overflow-hidden bg-[var(--accent)] text-white">
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden="true">
            <defs>
              <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/[0.04] rounded-full" aria-hidden="true" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white/[0.05] rounded-full" aria-hidden="true" />
          <div className="relative max-w-[1080px] mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold tracking-tight">{safeUser.name}님, 안녕하세요</h1>
              <p className="text-[15px] text-white/75 mt-1">{summaryLine}</p>
              {!isMaker && statsLine && <p className="text-[13px] text-white/60 mt-2">{statsLine}</p>}
            </div>
            <dl className="flex items-center gap-5 sm:gap-7">
              {heroStats.map((st, i) => (
                // 숫자를 위에 크게 보이되 마크업은 dt → dd 순서를 지킴(flex-col-reverse)
                <div key={st.label} className={`flex flex-col-reverse ${i > 0 ? "pl-5 sm:pl-7 border-l border-white/15" : ""}`}>
                  <dt className="text-[13px] text-white/70 mt-0.5">{st.label}</dt>
                  <dd className="text-xl sm:text-2xl font-bold tabular-nums">
                    {st.href ? <Link href={st.href} className="hover:underline underline-offset-4">{st.value}</Link> : st.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <main className="max-w-[1080px] mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1">

        <div className={focus ? "" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start"}>
          <div className="space-y-4 min-w-0">
            {/* 제출 결과는 폰에서도 바로 보이도록 첫 줄에 둠 */}
            {!focus && submitted === "1" && (
              <div role="status" className="rounded-[var(--radius-md)] bg-[var(--warning-light)] text-[var(--gray-800)] text-sm px-4 py-3">
                <strong>승인 요청을 보냈어요.</strong> 관리자가 내용을 확인하면 평가자 모집이 시작돼요. 승인·반려 결과는 알림으로 알려 드려요.
              </div>
            )}
            {!focus && answeredParam && (
              <div role="status" className="rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] text-sm px-4 py-3">
                <strong>{answeredParam === "updated" ? "고친 응답을 저장했어요." : "응답을 제출했어요. 참여해 주셔서 고마워요."}</strong>
                {answeredParam !== "updated" && " 보상이 있는 평가는 검수 후 지급돼요."}
              </div>
            )}
            {!focus && invalid === "1" && (
              <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] text-sm px-4 py-3">
                <strong>응답을 저장하지 못했어요.</strong> 빠진 문항이나 올바르지 않은 값이 있어요. 평가를 다시 열어 확인한 뒤 제출해 주세요. 작성하던 내용은 이 기기에 남아 있어요.
              </div>
            )}
            {!focus && full === "1" && (
              <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] text-sm px-4 py-3">
                <strong>모집 정원이 찼어요.</strong> 응답은 저장되지 않았어요. 다른 평가를 찾아봐 주세요.
              </div>
            )}
            {!focus && (
              <section aria-labelledby="todo-h" className="bg-white rounded-[var(--radius-xl)] p-5">
                <h2 id="todo-h" className="text-[17px] font-bold text-[var(--foreground)] mb-1">
                  지금 할 일
                </h2>
                {tasks.length === 0 && !isMaker && recruitingProjects.length === 0 ? (
                  // 모집 중인 평가가 없으면 찾기 버튼이 빈 목록으로만 이어짐
                  <p className="text-sm text-[var(--muted)] pt-2">지금 모집 중인 평가가 없어요. 새 평가가 열리면 알림으로 알려 드려요.</p>
                ) : tasks.length === 0 ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-sm text-[var(--muted)]">
                      {isMaker ? "평가 만들기에서 Evi 동행 평가·표준 설문·자유 설문 중 하나를 골라 시작해 주세요." : "관심 있는 평가에 신청하세요. 선발되면 여기서 평가를 시작할 수 있어요."}
                    </p>
                    <Link href={isMaker ? "/dashboard/services" : "/dashboard/surveys"} className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-dark)]">
                      {isMaker ? "새 평가 만들기" : "참여할 평가 찾기"}
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--gray-100)]">
                    {tasks.slice(0, TASK_PREVIEW).map((t) => (
                      <li key={t.key}>
                        <TaskRow t={t} />
                      </li>
                    ))}
                  </ul>
                )}
                {tasks.length > TASK_PREVIEW && (
                  <details className="group">
                    <summary className="list-none cursor-pointer pt-2 text-sm text-[var(--gray-600)]">
                      <span className="group-open:hidden">{tasks.length - TASK_PREVIEW}건 더 보기</span>
                      <span className="hidden group-open:inline">접기</span>
                    </summary>
                    <ul className="divide-y divide-[var(--gray-100)]">
                      {tasks.slice(TASK_PREVIEW).map((t) => (
                        <li key={t.key}>
                          <TaskRow t={t} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {/* 폰에서는 일정보다 모집 중을 먼저 보여줌. 넓은 화면은 오른쪽 열에 둠 */}
            {!focus && <div className="lg:hidden">{recruitSection}</div>}

            <DashboardView
              projects={safeProjects}
              user={safeUser}
              confirmedServices={confirmedServices}
              linkableOrders={linkableOrders}
            />
          </div>

          {!focus && (
            <aside className="space-y-4">
              {/* 학생은 계좌 미등록을 알 수 있도록 항상 보여줌 */}
              {showRewards && (
                <MyRewardsPanel
                  summary={myRewardSummary}
                  profile={{
                    bankName: myProfile.bankName,
                    accountNumber: myProfile.accountNumber,
                    holderName: myProfile.holderName,
                    hasRrn: myProfile.hasRrn,
                    payoutReady: myProfile.payoutReady,
                    withholdingReady: myProfile.withholdingReady,
                    byAdmin: myProfile.byAdmin,
                  }}
                />
              )}

              <div className="hidden lg:block">{recruitSection}</div>
            </aside>
          )}
        </div>
      </main>

      <footer className="max-w-[1080px] mx-auto w-full px-4 sm:px-6 pt-4 pb-24 lg:pb-8 text-[13px] text-[var(--muted)]">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <span>AI 평가단 · 한림대학교 머신러닝 연구실</span>
          <a href="mailto:labchain.hallym@gmail.com" className="hover:text-[var(--foreground)]">labchain.hallym@gmail.com</a>
          {contact && (
            <a href={`tel:${contact.replace(/[^\d+]/g, "")}`} className="hover:text-[var(--foreground)]">{contact}</a>
          )}
        </p>
      </footer>
    </div>
  );
}

/** 할 일 한 줄. 응답처럼 바로 할 일만 강조 버튼을 씀 */
function TaskRow({ t }: { t: { title: string; desc: string; href: string; cta: string; tone: string } }) {
  const descTone = t.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]";
  return (
    <Link href={t.href} scroll={false} className="flex items-center gap-3 py-3.5 -mx-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--foreground)] truncate">{t.title}</span>
        <span className={`block text-[13px] mt-0.5 truncate ${descTone}`}>{t.desc}</span>
      </span>
      <span
        className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-[10px] ${
          t.tone === "primary" ? "bg-[var(--accent)] text-white" : "bg-[var(--gray-100)] text-[var(--gray-700)]"
        }`}
      >
        {t.cta}
      </span>
    </Link>
  );
}
