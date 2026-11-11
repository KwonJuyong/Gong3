import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { prisma } from "../db";
import { maskStudentId } from "../lib/privacy";
import DashboardView, { type DashboardProject, type LinkableOrder } from "./DashboardView";
import MyRewardsPanel, { type MyRewardSummary } from "./MyRewardsPanel";
import { getSettlementProfile } from "../lib/settlementProfile";
import { visibleProjectWhere, capacityOf, rewardPerPersonOf, isPayerUs } from "../lib/approvals";
import { getQuoteSupplier } from "../lib/orgSettings";

export const metadata = { title: "대시보드" };

/**
 * 대시보드 첫 화면. 맨 위에 「지금 할 일」(응답할 평가, 선발 대기, 운영할 평가)을 두고
 * 평가 일정은 그 아래에 보여줌
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; p?: string }>;
}) {
  // 「지금 할 일」과 좌측 목록은 목록·상세 화면에서만 보임
  const { view, p: selectedId } = await searchParams;
  // 저장해 둔 옛 주소
  if (view === "create-choose") redirect("/dashboard/services");
  const focus = !!view && view !== "list" && view !== "detail";
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

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

  if (!userRaw) redirectToLogin();

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
    title: p.title,
    description: p.description,
    location: p.location,
    status: p.status,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime?.toISOString() || null,
    questions: (isOpened ? opened.questions : []) as unknown as DashboardProject["questions"],
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

    // 아직 평가에 연결되지 않은 발주(취소·환불 제외)
    const orders = await prisma.order.findMany({
      where: {
        projectId: null,
        status: { in: ["PENDING", "PAID"] },
        ...(safeUser.role !== "ADMIN" ? { buyerId: safeUser.id } : {}),
      },
      select: {
        id: true,
        orderNo: true,
        panelSize: true,
        rewardPerPerson: true,
        status: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    linkableOrders = orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      serviceName: o.service.name,
      panelSize: o.panelSize,
      rewardPerPerson: o.rewardPerPerson,
      paid: o.status === "PAID",
    }));
  }

  // 지금 할 일
  const myEnrollment = (p: (typeof safeProjects)[number]) => p.enrollments.find((e) => e.userId === safeUser.id);
  const answered = (p: (typeof safeProjects)[number]) => p.responses.some((r) => r.userId === safeUser.id);

  // 선발됐고 진행 중인데 아직 응답하지 않은 평가
  const toRespond = safeProjects.filter(
    (p) => p.status === "ACTIVE" && myEnrollment(p)?.status === "ACCEPTED" && !answered(p),
  );
  // 신청하고 선발 결과를 기다리는 평가
  const awaiting = safeProjects.filter(
    (p) => p.status === "RECRUITING" && !!myEnrollment(p) && myEnrollment(p)?.status !== "REMOVED",
  );
  // 개설자(본인 것)·관리자(전체)의 운영 할 일
  const mine = safeProjects.filter((p) => isAdmin || p.creatorId === safeUser.id);
  const myPending = mine.filter((p) => p.status === "PENDING_APPROVAL" && (!isAdmin || p.creatorId === safeUser.id));
  const myRejected = mine.filter((p) => p.status === "REJECTED" && p.creatorId === safeUser.id);
  const toSelect = mine.filter((p) => p.status === "RECRUITING" && p.enrollmentCount > 0);
  const upcomingReward = (myRewardSummary?.upcoming.amount ?? 0) + (myRewardSummary?.reviewing.amount ?? 0);

  type Task = { key: string; tone: "primary" | "warn" | "info" | "danger"; title: string; desc: string; href: string; cta: string };
  const tasks: Task[] = [
    ...toRespond.map((p) => ({
      key: `r-${p.id}`,
      tone: "primary" as const,
      title: p.title,
      desc: "선발됐어요 · 응답해 주세요",
      href: `/dashboard?view=eval&p=${p.id}`,
      cta: "응답하기",
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
    ...awaiting.map((p) => ({
      key: `a-${p.id}`,
      tone: "info" as const,
      title: p.title,
      desc: "선발 결과를 기다리는 중",
      href: `/dashboard?view=detail&p=${p.id}`,
      cta: "보기",
    })),
    ...myPending.map((p) => ({
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

  const summaryLine =
    [toRespond.length > 0 ? `응답할 평가 ${toRespond.length}건` : null, awaiting.length > 0 ? `결과 대기 ${awaiting.length}건` : null]
      .filter(Boolean)
      .join(" · ") || "지금 처리할 일은 없어요";

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
            </div>
            <dl className="flex items-center gap-5 sm:gap-7">
              {[
                { label: "응답 대기", value: `${toRespond.length}건` },
                { label: "참여한 평가", value: `${participatedProjects.length}건`, href: "/dashboard/surveys#participated" },
                { label: "받을 보상", value: `${upcomingReward.toLocaleString("ko-KR")}원` },
              ].map((st, i) => (
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
            {!focus && (
              <section aria-labelledby="todo-h" className="bg-white rounded-[var(--radius-xl)] p-5">
                <h2 id="todo-h" className="text-[17px] font-bold text-[var(--foreground)] mb-1">
                  지금 할 일
                </h2>
                {tasks.length === 0 ? (
                  <p className="text-[15px] text-[var(--muted)] py-5">
                    할 일이 없어요.{" "}
                    <Link href="/dashboard/surveys" className="text-[var(--accent)] font-medium">
                      참여할 평가 찾기
                    </Link>
                  </p>
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

            <DashboardView
              projects={safeProjects}
              user={safeUser}
              confirmedServices={confirmedServices}
              linkableOrders={linkableOrders}
            />
          </div>

          {!focus && (
            <aside className="space-y-4">
              {/* 계좌 미등록을 알 수 있도록 항상 보여줌 */}
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
