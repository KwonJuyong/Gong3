"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkLimit } from "../lib/limits";
import { prisma, getSessionUser } from "../db";
import { redirectToLogin } from "../session-server";
import { createNotifications } from "../lib/notify";
// 승인·반려 액션은 app/dashboard/approvals/actions.ts 에 있음
import { notifyAdminsForReview, capacityOf } from "../lib/approvals";
import { parseFundingType, strOrNull, linkOrder, normalizeUrl, parseEnrollmentDeadline } from "../lib/projectForm";
import { parseProjectGuides } from "../lib/projectGuides";
import { createRewardForResponse } from "../lib/rewards";
import { maskStudentId } from "../lib/privacy";
import { saveResponse } from "../lib/responses";
import { type SurveyBlock } from "../lib/surveyBlocks";
import {
  blocksToProjectQuestions,
  questionKey,
  isValidAnswer,
  MAX_TEXT_ANSWER,
  type ProjectQuestion,
} from "../lib/projectQuestions";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseQuestions(formData: FormData) {
  const questions: { id: number; label: string; type: string; options?: string[] }[] = [];
  let i = 0;
  while (formData.has(`q_label_${i}`)) {
    const label = ((formData.get(`q_label_${i}`) as string) || "").trim();
    const type = (formData.get(`q_type_${i}`) as string) || "text";
    const rawOptions = (formData.get(`q_options_${i}`) as string) || "";
    const options = rawOptions.split("\n").map((s) => s.trim()).filter(Boolean);
    if (label) {
      const hasOptions = type === "dropdown" || type === "checkbox";
      questions.push({ id: i, label, type, ...(hasOptions ? { options } : {}) });
    }
    i++;
  }
  return questions;
}

/** 참여가 열린 학생에게 보낼 안내. 동행 평가는 과제가 공개돼야 시작할 수 있음 */
function startNotice(project: { id: string; evalMode: string; scenario: { publishedAt: Date | null } | null }, lead: string) {
  if (project.evalMode !== "ACCOMPANY") return { content: `${lead} 지금부터 응답할 수 있어요.`, link: `/dashboard?view=eval&p=${project.id}` };
  return project.scenario?.publishedAt
    ? { content: `${lead} 지금 Evi와 과제를 시작할 수 있어요.`, link: `/dashboard?view=task&p=${project.id}` }
    : { content: `${lead} Evi 과제가 공개되면 다시 알려 드릴게요.`, link: `/dashboard?view=detail&p=${project.id}` };
}


export async function createProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || (me.role !== "DEVELOPER" && me.role !== "ADMIN")) return;

  const questions = parseQuestions(formData);
  const title = (formData.get("title") as string) || "";
  const description = ((formData.get("description") as string) || "").trim() || null;
  const location = (formData.get("location") as string) || "미정";
  const link = normalizeUrl((formData.get("link") as string) || "");

  const now = new Date();
  const date =
    (formData.get("date") as string) ||
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time =
    (formData.get("time") as string) ||
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const startTime = new Date(`${date}T${time}:00+09:00`);

  const minParticipants = Math.max(1, parseInt((formData.get("minParticipants") as string) || "1", 10) || 1);
  const maxParticipants = Math.max(minParticipants, parseInt((formData.get("maxParticipants") as string) || "10", 10) || 10);

  const enrollmentDeadline = parseEnrollmentDeadline(formData);

  const project = await prisma.project.create({
    data: {
      title,
      description,
      location,
      startTime,
      questions,
      guides: parseProjectGuides(formData.get("guides")),
      // 관리자가 승인해야 모집이 시작됨
      status: "PENDING_APPROVAL",
      // 문항 출처: 직접 입력. 자금 출처는 fundingType 이 따로 정함
      questionSource: "MANUAL",
      fundingType: parseFundingType(formData),
      contractRef: strOrNull(formData, "contractRef"),
      fundRef: strOrNull(formData, "fundRef"),
      link,
      creatorId: me.id,
      minParticipants,
      maxParticipants,
      enrollmentDeadline,
    },
  });

  await linkOrder(strOrNull(formData, "orderId"), project.id, me);

  // 관리자에게 검토를 요청함. 학생 알림은 승인 때 보냄
  await notifyAdminsForReview({ title, requesterId: me.id });

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

export async function updateProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { order: { select: { panelSize: true } } },
  });
  if (!project) return;

  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  const [responseCount, acceptedCount] = await Promise.all([
    prisma.response.count({ where: { projectId } }),
    prisma.enrollment.count({ where: { projectId, status: "ACCEPTED" } }),
  ]);

  // 문항은 편집기를 보냈을 때(editQuestions=1)만 바꿈. 표준 구성 문항(itemKey)이 있거나
  // 응답이 있으면 바꾸지 않음. 수동 편집기가 표준 문항을 표현하지 못하고, 응답 키가
  // 배열 인덱스라 문항을 지우면 기존 응답이 다른 문항에 붙기 때문임
  const questionsLocked =
    responseCount > 0 ||
    ((project.questions as unknown as { itemKey?: string }[]) || []).some((q) => !!q?.itemKey);
  // 승인 후에는 문항·서비스 주소·정원을 ADMIN 만 바꿈. 개설자가 바꾸면 승인 검토를 거치지 않은 내용이 학생에게 나감
  const approvedLock =
    me.role !== "ADMIN" && !["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(project.status);
  const questions =
    formData.get("editQuestions") === "1" && project.evalMode === "SURVEY" && !questionsLocked && !approvedLock
      ? parseQuestions(formData)
      : undefined;
  const title = (formData.get("title") as string) || "";
  const description = ((formData.get("description") as string) || "").trim() || null;
  const location = (formData.get("location") as string) || "미정";
  const link = approvedLock ? project.link : normalizeUrl((formData.get("link") as string) || "");

  // 의뢰가 연결된 평가는 의뢰 인원(order.panelSize)이 정본이라 maxParticipants 를 바꾸지 않음
  let nextMaxParticipants: number | undefined;
  if (!approvedLock && !project.order && formData.has("maxParticipants")) {
    const parsed = parseInt(String(formData.get("maxParticipants") || ""), 10);
    if (Number.isInteger(parsed) && parsed >= 1) {
      const floor = Math.max(project.minParticipants, acceptedCount, responseCount);
      nextMaxParticipants = Math.max(floor, parsed);
    }
  }
  const reopenByCapacity =
    project.status === "ACTIVE" &&
    project.closedAt !== null &&
    nextMaxParticipants !== undefined &&
    nextMaxParticipants > responseCount;

  const now = new Date();
  const date =
    (formData.get("date") as string) ||
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time =
    (formData.get("time") as string) ||
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const startTime = new Date(`${date}T${time}:00+09:00`);

  // 반려된 평가를 고치면 다시 승인 대기로 돌림. 화면 안내(「고쳐서 다시 요청」)의 유일한 경로
  const resubmit = project.status === "REJECTED";
  await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      description,
      location,
      startTime,
      link,
      ...(!approvedLock && formData.has("guides") ? { guides: parseProjectGuides(formData.get("guides")) } : {}),
      ...(nextMaxParticipants !== undefined ? { maxParticipants: nextMaxParticipants } : {}),
      ...(reopenByCapacity ? { closedAt: null } : {}),
      ...(questions ? { questions } : {}),
      ...(resubmit ? { status: "PENDING_APPROVAL", rejectReason: null, rejectedAt: null } : {}),
    },
  });
  if (resubmit) await notifyAdminsForReview({ title, requesterId: me.id });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/surveys");
  redirect(resubmit ? "/dashboard?submitted=1" : `/dashboard?view=detail&p=${projectId}`);
}

export async function submitResponseAction(formData: FormData) {
  const projectId = (formData.get("projectId") as string) || "";
  const me = await getSessionUser();
  // 작성 내용은 기기에 남아 있어 다시 로그인하면 같은 평가 화면에서 이어서 제출 가능
  if (!me) redirectToLogin(projectId ? `/dashboard?view=eval&p=${projectId}` : undefined);
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      enrollments: { where: { userId: me.id }, select: { status: true } },
      // 정원·보상 단가. 발주가 없으면 Project 값을 씀
      order: { select: { panelSize: true, rewardPerPerson: true } },
    },
  });
  if (!project) redirect("/dashboard");
  // 작성 중에 평가가 끝났거나 선발에서 제외된 경우. 조용히 끝내면 제출된 줄 알게 됨
  const isAccepted = project.enrollments[0]?.status === "ACCEPTED";
  if (project.status !== "ACTIVE" || !isAccepted) {
    redirect(`/dashboard?view=detail&p=${projectId}&answer=closed`);
  }
  // 동행 평가는 과제 대화를 저장할 때 응답이 생김. 설문 제출로 빈 응답·보상이 생기지 않게 막음
  if (project.evalMode === "ACCOMPANY") redirect(`/dashboard?view=task&p=${projectId}`);

  // 응답 키는 questionKey() 로 만듦(수동 문항은 인덱스, 설문 원본 문항은 itemKey).
  const projectQuestions = (project.questions as unknown as ProjectQuestion[]) || [];
  const allowed = new Set<string>();
  projectQuestions.forEach((q, i) => {
    const k = questionKey(q, i);
    allowed.add(k);
    // 서술형 개선 의견은 점수와 별도 키로 들어옴
    if (q?.itemKey && q.comment) allowed.add(`text:${q.itemKey}`);
  });

  const answers: Record<string, string | string[]> = {};
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("answer_") || typeof val !== "string") continue;
    const k = key.slice("answer_".length);
    // 문항에 없는 키는 버림
    if (!allowed.has(k)) continue;
    const prev = answers[k];
    if (prev === undefined) answers[k] = val;
    else if (Array.isArray(prev)) prev.push(val);
    else answers[k] = [prev, val];
  }

  // 화면 검증을 거치지 않은 제출(빈 응답·범위 밖 점수)은 저장하지 않음. 작성 내용은 기기에 남아 있음
  const valid =
    projectQuestions.every((q, i) => isValidAnswer(q, answers[questionKey(q, i)])) &&
    Object.entries(answers).every(
      ([k, v]) => !k.startsWith("text:") || (typeof v === "string" && v.length <= MAX_TEXT_ANSWER),
    );
  if (!valid) redirect("/dashboard?invalid=1");

  const outcome = await saveResponse(projectId, me.id, answers, capacityOf(project));

  if (outcome.kind === "full") redirect("/dashboard?full=1");
  if (outcome.kind === "updated") {
    revalidatePath("/dashboard");
    redirect(`/dashboard?answered=updated&done=${projectId}`);
  }

  // 기기 시계 기준이라 검수 보조 표시에만 씀. 30일을 넘는 값은 버림
  const elapsed = Number(formData.get("elapsedSec"));
  if (Number.isInteger(elapsed) && elapsed >= 0 && elapsed <= 30 * 86400) {
    await prisma.response.update({ where: { id: outcome.responseId }, data: { durationSec: elapsed } });
  }

  // 유상 평가면 보상을 만듦(연구비 건은 만들지 않음).
  await createRewardForResponse(outcome.responseId);

  revalidatePath("/dashboard");
  redirect(`/dashboard?answered=1&done=${projectId}`);
}

export async function finishProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      responses: { select: { userId: true } },
      enrollments: { where: { status: "ACCEPTED" }, select: { userId: true } },
    },
  });
  if (!project) return;

  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "FINISHED", endTime: new Date() },
  });

  const participantIds = new Set(project.responses.map((r) => r.userId));
  // 선발됐지만 아직 응답하지 않은 사람도 작성 중일 수 있어 따로 알림
  const unansweredIds = project.enrollments.map((e) => e.userId).filter((uid) => !participantIds.has(uid));
  await createNotifications([
    ...[...participantIds].map((uid) => ({
      userId: uid,
      type: "INFO",
      content: `참여한 평가가 종료되었어요: ${project.title}`,
      // 동행 평가는 종료 뒤에도 내 기록·개발사 답을 과제 화면에서 봄
      link: `/dashboard?view=${project.evalMode === "ACCOMPANY" ? "task" : "detail"}&p=${projectId}`,
    })),
    ...unansweredIds.map((uid) => ({
      userId: uid,
      type: "INFO",
      content: `"${project.title}" 평가가 종료되어 더 이상 참여할 수 없어요.`,
      link: `/dashboard?view=detail&p=${projectId}`,
    })),
  ]);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function deleteProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  await prisma.response.deleteMany({ where: { projectId } });
  await prisma.enrollment.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function enrollProjectAction(formData: FormData) {
  const me = await getSessionUser();
  // 신청마다 개설자·관리자에게 알림이 쌓임
  if (!me || checkLimit("enroll", me.id)) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      _count: { select: { enrollments: true } },
      enrollments: { where: { status: "ACCEPTED" }, select: { id: true } },
      order: { select: { panelSize: true } },
    },
  });
  if (!project) return;
  const capacity = capacityOf(project);
  const acceptedCount = project.enrollments.length;
  // 모집 중이면 기한 전까지 정원과 무관하게 신청 가능. 진행 중이면 마감 전이면서 정원에 빈자리가 있을 때만 추가 신청 허용
  const recruitingOpen =
    project.status === "RECRUITING" &&
    !(project.enrollmentDeadline && new Date() > project.enrollmentDeadline);
  const lateOpen =
    project.status === "ACTIVE" &&
    project.closedAt === null &&
    acceptedCount < capacity;
  if (!recruitingOpen && !lateOpen) {
    redirect(`/dashboard?view=detail&p=${projectId}&enroll=closed`);
  }

  // 연속 클릭·재시도로 같은 신청이 겹쳐도 한 건만 만들고 알림도 한 번만 보냄(unique 충돌 오류 화면 방지)
  const { count } = await prisma.enrollment.createMany({
    data: [{ projectId, userId: me.id, status: "PENDING" }],
    skipDuplicates: true,
  });
  if (count === 0) return;

  const notifyUserIds = new Set<string>();
  if (project.creatorId) notifyUserIds.add(project.creatorId);
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  admins.forEach((a) => notifyUserIds.add(a.id));
  notifyUserIds.delete(me.id);

  if (notifyUserIds.size > 0) {
    const content = lateOpen
      ? `${me.name}(${maskStudentId(me.studentId, false)})님이 "${project.title}" 평가에 추가 참여 신청했습니다. (참여 ${acceptedCount}/${capacity}명)`
      : `${me.name}(${maskStudentId(me.studentId, false)})님이 "${project.title}" 평가에 참여 신청했습니다. (신청 ${project._count.enrollments + 1}명 · 정원 ${capacity}명)`;
    // 신청마다 가는 알림이라 푸시는 보내지 않고 인앱에만 쌓음
    await createNotifications(
      Array.from(notifyUserIds).map((uid) => ({
        userId: uid,
        type: "INFO",
        content,
      })),
      { push: false, link: `/dashboard?view=recruit&p=${projectId}` },
    );
  }

  revalidatePath("/dashboard");
  // 목록에서 바로 신청한 경우 목록에 머묾. 그 외에는 같은 평가 상세로 돌아감
  if (formData.get("back") === "surveys") {
    revalidatePath("/dashboard/surveys");
    redirect("/dashboard/surveys?enrolled=1");
  }
  redirect(`/dashboard?view=detail&p=${projectId}`);
}

/**
 * 모집 중이거나 선발되지 않은 신청만 취소할 수 있음. 평가가 시작된 뒤 선발된 사람의 제외는
 * 관리자가 removeParticipantAction 으로 함
 */
export async function cancelEnrollmentAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const [project, enrollment] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
    prisma.enrollment.findUnique({
      where: { projectId_userId: { projectId, userId: me.id } },
      select: { status: true },
    }),
  ]);
  if (!project || !enrollment) return;

  const cancellable =
    project.status === "RECRUITING" ||
    enrollment.status === "PENDING" ||
    enrollment.status === "REJECTED";
  if (!cancellable) return;

  await prisma.enrollment.deleteMany({
    // 조회와 삭제 사이에 선발이 확정됐으면 지우지 않도록 조건을 다시 걸기
    where: {
      projectId,
      userId: me.id,
      ...(project.status === "RECRUITING" ? {} : { status: { in: ["PENDING", "REJECTED"] } }),
    },
  });

  revalidatePath("/dashboard");
  // 같은 평가 상세로 돌아가 바뀐 상태를 보여줌
  redirect(`/dashboard?view=detail&p=${projectId}`);
}

/**
 * 체크된 신청자를 ACCEPTED, 나머지를 REJECTED 로 확정함
 * formData.start === "1" 이면 선발 확정과 동시에 평가를 시작(RECRUITING → ACTIVE)함
 */
export async function selectParticipantsAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      enrollments: { select: { userId: true, status: true } },
      scenario: { select: { publishedAt: true } },
      order: { select: { panelSize: true } },
    },
  });
  // 선발은 모집 중에만 함. 진행 중에 실행하면 체크하지 않은 응답자까지 REJECTED 가 됨
  // 진행 중 인원 조정은 제외·추가 액션으로 함
  if (!project || project.status !== "RECRUITING") return;
  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  // 체크박스는 선택된 항목만 전송되므로 나머지는 비선발임
  const acceptedIds = new Set(formData.getAll("accepted").map((v) => String(v)));
  const enrolledIds = new Set(
    project.enrollments.filter((e) => e.status !== "REMOVED").map((e) => e.userId),
  );
  const start = (formData.get("start") as string) === "1";
  // 선발 저장 때는 화면을 연 뒤 들어온 신청을 그대로 둠(개설자가 보지 못함). 시작하면 더 뽑을 수 없어 모두 비선발
  const shownIds = new Set(formData.getAll("shown").map((v) => String(v)));
  // 신청하지 않은 사용자가 섞여 들어오는 것을 막음
  const accepted = [...acceptedIds].filter((id) => enrolledIds.has(id));
  const rejected = [...enrolledIds].filter((id) => !acceptedIds.has(id) && (start || shownIds.has(id)));

  // 의뢰 인원이 정원. 응답 저장(saveResponse)과 같은 기준이어야 선발된 학생이 정원 마감에 막히지 않음
  if (accepted.length > capacityOf(project)) return;

  if (start && accepted.length < project.minParticipants) return;

  await prisma.$transaction([
    prisma.enrollment.updateMany({
      where: { projectId, userId: { in: accepted } },
      data: { status: "ACCEPTED" },
    }),
    prisma.enrollment.updateMany({
      where: { projectId, userId: { in: rejected } },
      data: { status: "REJECTED" },
    }),
    ...(start
      ? [prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } })]
      : []),
  ]);

  // 평가를 시작할 때만 결과를 통보함(선발 도중의 체크 변경으로 알림이 쏟아지지 않도록)
  if (start) {
    const notifications = [
      ...accepted.map((uid) => ({
        userId: uid,
        type: "INFO",
        ...startNotice(project, `"${project.title}" 평가에 선발되었어요.`),
        fromUserId: me.id,
      })),
      ...rejected.map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `"${project.title}" 평가는 정원이 마감되어 이번에는 참여하지 못하게 되었습니다.`,
        fromUserId: me.id,
        link: `/dashboard?view=detail&p=${projectId}`,
      })),
    ];
    if (notifications.length > 0) {
      await createNotifications(notifications);
    }
  }

  revalidatePath("/dashboard");
  redirect(start ? "/dashboard" : `/dashboard?view=recruit&p=${projectId}`);
}

/** 서비스의 확정한 표준 문항(versionId)으로 표준 설문 평가를 만듦. 동행 평가는 accompany/create-actions.ts */
export async function createProjectFromServiceAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || (me.role !== "DEVELOPER" && me.role !== "ADMIN")) return;

  const versionId = ((formData.get("versionId") as string) || "").trim();
  if (!versionId) return;
  const version = await prisma.surveyVersion.findUnique({
    where: { id: versionId, status: "CONFIRMED" },
    include: { service: true },
  });
  if (!version) return;
  const service = version.service;
  if (service.ownerId !== me.id && me.role !== "ADMIN") return;

  // 설문 → 평가 문항 변환은 projectQuestions.ts 에서 함
  const blocks = (version.blocks as unknown as SurveyBlock[]) || [];
  const snapshot =
    (version.constructSnapshot as unknown as { id: string; evaluator?: string | null }[]) || [];
  // Prisma Json 입력 타입이 인덱스 시그니처를 요구해서 캐스팅함
  const questions = blocksToProjectQuestions(blocks, snapshot) as unknown as object[];

  const title = ((formData.get("title") as string) || service.name).trim();
  const location = ((formData.get("location") as string) || "미정").trim();
  const description = ((formData.get("description") as string) || "").trim() || null;

  const date = (formData.get("date") as string) || new Date().toISOString().slice(0, 10);
  const time = (formData.get("time") as string) || "10:00";
  const startTime = new Date(`${date}T${time}:00+09:00`);

  const minParticipants = Math.max(1, parseInt((formData.get("minParticipants") as string) || "1", 10) || 1);
  const maxParticipants = Math.max(minParticipants, parseInt((formData.get("maxParticipants") as string) || "10", 10) || 10);

  const project = await prisma.project.create({
    data: {
      title,
      description,
      location,
      startTime,
      questions,
      guides: parseProjectGuides(formData.get("guides")),
      // 관리자가 승인해야 모집이 시작됨
      status: "PENDING_APPROVAL",
      // 표준 설문. 원본 회차를 남김
      questionSource: "AUTO",
      surveyVersionId: version.id,
      serviceId: service.id,
      fundingType: parseFundingType(formData),
      contractRef: strOrNull(formData, "contractRef"),
      fundRef: strOrNull(formData, "fundRef"),
      link: normalizeUrl((formData.get("link") as string) || ""),
      creatorId: me.id,
      minParticipants,
      maxParticipants,
      enrollmentDeadline: parseEnrollmentDeadline(formData),
    },
  });

  await linkOrder(strOrNull(formData, "orderId"), project.id, me);

  // 관리자에게 검토를 요청함. 학생 알림은 승인 때 보냄
  await notifyAdminsForReview({ title: project.title, requesterId: me.id });

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

/**
 * 실수로 취소한 참여 신청 한 건을 되살림
 * 되살린 신청은 PENDING 이고 선발 때 정원이 적용됨. 이미 신청이 있으면 아무것도 하지 않음
 */
export interface RestoreState {
  ok?: string;
  error?: string;
}

export async function restoreEnrollmentAction(
  _prev: RestoreState | null,
  formData: FormData,
): Promise<RestoreState> {
  const me = await getSessionUser();
  if (!me) return { error: "권한이 없습니다." };

  const projectId = (formData.get("projectId") as string) || "";
  const studentId = ((formData.get("studentId") as string) || "").trim();
  if (!projectId || !studentId) return { error: "학번을 입력해주세요." };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "평가를 찾을 수 없습니다." };
  if (me.role !== "ADMIN" && project.creatorId !== me.id) return { error: "권한이 없습니다." };
  // 선발은 모집 중에만 하므로, 진행 중인 평가는 addParticipantAction 으로 추가함
  if (project.status !== "RECRUITING") {
    return { error: "모집 중인 평가에서만 복구할 수 있습니다. 진행 중인 평가는 관리자가 「평가자 추가」로 넣어 주세요." };
  }

  const user = await prisma.user.findUnique({
    where: { studentId },
    select: { id: true, name: true, status: true },
  });
  if (!user) return { error: `학번 ${studentId} 인 회원을 찾을 수 없습니다.` };
  if (user.status !== "ACTIVE") return { error: `${user.name}님은 현재 이용할 수 없는 계정입니다.` };

  const existing = await prisma.enrollment.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (existing) return { ok: `${user.name}님은 이미 신청 상태입니다(${existing.status}).` };

  await prisma.enrollment.create({ data: { projectId, userId: user.id, status: "PENDING" } });
  await createNotifications(
    [{
      userId: user.id,
      type: "INFO",
      content: `"${project.title}" 평가 참여 신청이 복구되었습니다.`,
      fromUserId: me.id,
    }],
    { push: false },
  );

  revalidatePath("/dashboard");
  return { ok: `${user.name}님의 신청을 복구했습니다. 아래 목록에서 선발해 주세요.` };
}

/**
 * 진행 중 참여자 관리(ADMIN 전용).
 *
 * - 제외는 행을 지우지 않고 status = "REMOVED" 로 남김. 제외된 사람은 응답을 제출할 수 없음
 * - 이미 응답한 사람은 보상이 붙어 있어 제외하지 않음
 * - 정원은 capacityOf() 로 판정함(발주가 있으면 발주 인원).
 * - 모든 조작은 AuditLog 에 남음
 */
export interface ParticipantState {
  ok?: string;
  error?: string;
}

async function participantAudit(actorId: string, targetId: string, action: string, summary: string) {
  // 기록에 실패해도 이미 끝난 조작은 되돌리지 않음
  try {
    await prisma.auditLog.create({ data: { actorId, targetId, action, summary } });
  } catch {
    /* 무시 */
  }
}

/** 선발된 사람을 진행 중인 평가에서 뺌 */
export async function removeParticipantAction(
  _prev: ParticipantState | null,
  formData: FormData,
): Promise<ParticipantState> {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return { error: "관리자만 평가자를 제외할 수 있습니다." };

  const projectId = (formData.get("projectId") as string) || "";
  const userId = (formData.get("userId") as string) || "";
  const reason = ((formData.get("reason") as string) || "").trim().slice(0, 200);
  if (!projectId || !userId) return { error: "대상이 지정되지 않았습니다." };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, status: true },
  });
  if (!project) return { error: "평가를 찾을 수 없습니다." };
  if (project.status !== "ACTIVE") return { error: "진행 중인 평가에서만 제외할 수 있습니다." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return { error: "회원을 찾을 수 없습니다." };

  const responded = await prisma.response.count({ where: { projectId, userId } });
  if (responded > 0) {
    return { error: `${user.name}님은 이미 응답을 제출해 제외할 수 없습니다(응답에 보상이 연결됩니다).` };
  }

  // 조건부 갱신. 이미 처리됐으면 0건임
  const updated = await prisma.enrollment.updateMany({
    where: { projectId, userId, status: "ACCEPTED" },
    data: { status: "REMOVED" },
  });
  if (updated.count === 0) return { error: `${user.name}님은 현재 선발 상태가 아닙니다.` };

  // 확인과 갱신 사이에 응답이 들어왔으면 되돌림
  const raced = await prisma.response.count({ where: { projectId, userId } });
  if (raced > 0) {
    await prisma.enrollment.updateMany({
      where: { projectId, userId, status: "REMOVED" },
      data: { status: "ACCEPTED" },
    });
    return { error: `${user.name}님이 방금 응답을 제출해 제외하지 않았습니다.` };
  }

  await createNotifications([
    {
      userId,
      type: "INFO",
      content: `"${project.title}" 평가 참여에서 제외되었습니다.${reason ? ` 사유: ${reason}` : ""} 문의는 관리자에게 해 주세요.`,
      fromUserId: me.id,
    },
  ]);
  await participantAudit(
    me.id,
    userId,
    "PROJECT_PARTICIPANT_REMOVE",
    `평가 「${project.title}」 평가자 제외${reason ? ` (사유: ${reason})` : ""}`,
  );

  revalidatePath("/dashboard");
  return { ok: `${user.name}님을 제외했습니다. 빈 자리에 다른 평가자를 추가할 수 있습니다.` };
}

/** 진행 중인 평가에 바로 선발(ACCEPTED) 상태로 넣음 */
export async function addParticipantAction(
  _prev: ParticipantState | null,
  formData: FormData,
): Promise<ParticipantState> {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return { error: "관리자만 평가자를 추가할 수 있습니다." };

  const projectId = (formData.get("projectId") as string) || "";
  const loginId = ((formData.get("loginId") as string) || "").trim();
  if (!projectId || !loginId) return { error: "학번 또는 이메일을 입력해주세요." };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      order: { select: { panelSize: true } },
      enrollments: { where: { status: "ACCEPTED" }, select: { userId: true } },
      scenario: { select: { publishedAt: true } },
    },
  });
  if (!project) return { error: "평가를 찾을 수 없습니다." };
  if (project.status !== "ACTIVE") return { error: "진행 중인 평가에서만 추가할 수 있습니다." };
  // 마감된 평가는 추가해도 응답할 수 없음
  if (project.closedAt) return { error: "응답이 마감된 평가라 추가해도 응답할 수 없습니다." };

  const capacity = capacityOf(project);
  if (project.enrollments.length >= capacity) {
    return { error: `정원(${capacity}명)이 찼습니다. 먼저 참여하지 않는 사람을 제외해 주세요.` };
  }

  // 이메일과 학번 모두로 찾을 수 있게 함
  const user = loginId.includes("@")
    ? await prisma.user.findFirst({
        where: { email: { equals: loginId, mode: "insensitive" } },
        select: { id: true, name: true, status: true },
      })
    : await prisma.user.findUnique({
        where: { studentId: loginId },
        select: { id: true, name: true, status: true },
      });
  if (!user) return { error: `${loginId} 에 해당하는 회원을 찾을 수 없습니다.` };
  if (user.status !== "ACTIVE") return { error: `${user.name}님은 현재 이용할 수 없는 계정입니다.` };

  const existing = await prisma.enrollment.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { status: true },
  });
  if (existing?.status === "ACCEPTED") return { ok: `${user.name}님은 이미 평가자입니다.` };

  if (existing) {
    await prisma.enrollment.update({
      where: { projectId_userId: { projectId, userId: user.id } },
      data: { status: "ACCEPTED" },
    });
  } else {
    await prisma.enrollment.create({ data: { projectId, userId: user.id, status: "ACCEPTED" } });
  }

  await createNotifications([
    {
      userId: user.id,
      type: "INFO",
      ...startNotice(project, `"${project.title}" 평가자로 추가되었어요.`),
      fromUserId: me.id,
    },
  ]);
  await participantAudit(
    me.id,
    user.id,
    "PROJECT_PARTICIPANT_ADD",
    `평가 「${project.title}」 평가자 추가${existing ? ` (이전 상태 ${existing.status})` : ""}`,
  );

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/surveys");
  return { ok: `${user.name}님을 평가자로 추가했습니다. (${project.enrollments.length + 1}/${capacity}명)` };
}

/** 진행 중(ACTIVE) 추가 신청(PENDING)을 수락하거나 거절함. 정원 초과를 막기 위해 프로젝트 행을 잠금 */
export async function reviewPendingEnrollmentAction(
  _prev: ParticipantState | null,
  formData: FormData,
): Promise<ParticipantState> {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return { error: "관리자만 추가 신청을 처리할 수 있습니다." };

  const projectId = (formData.get("projectId") as string) || "";
  const userId = (formData.get("userId") as string) || "";
  const decision = (formData.get("decision") as string) || "";
  if (!projectId || !userId || (decision !== "ACCEPT" && decision !== "REJECT")) {
    return { error: "요청 값이 올바르지 않습니다." };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        order: { select: { panelSize: true } },
        scenario: { select: { publishedAt: true } },
      },
    });
    if (!project) return { error: "평가를 찾을 수 없습니다." } as const;
    if (project.status !== "ACTIVE") return { error: "진행 중인 평가에서만 처리할 수 있습니다." } as const;

    const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, status: true } });
    if (!user) return { error: "회원을 찾을 수 없습니다." } as const;

    const capacity = capacityOf(project);
    const acceptedCount = await tx.enrollment.count({ where: { projectId, status: "ACCEPTED" } });

    if (decision === "ACCEPT") {
      if (project.closedAt) return { error: "응답이 마감된 평가라 수락할 수 없습니다." } as const;
      if (user.status !== "ACTIVE") return { error: `${user.name}님은 현재 이용할 수 없는 계정입니다.` } as const;
      if (acceptedCount >= capacity) {
        return { error: `정원(${capacity}명)이 찼습니다. 정원을 늘리거나 미참여자를 제외한 뒤 수락해 주세요.` } as const;
      }
      const updated = await tx.enrollment.updateMany({
        where: { projectId, userId, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
      if (updated.count === 0) return { error: `${user.name}님의 신청이 이미 처리되었거나 취소되었습니다.` } as const;
      return { ok: true, project, userName: user.name, acceptedCount: acceptedCount + 1, capacity } as const;
    }

    const updated = await tx.enrollment.updateMany({
      where: { projectId, userId, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    if (updated.count === 0) return { error: `${user.name}님의 신청이 이미 처리되었거나 취소되었습니다.` } as const;
    return { ok: true, project, userName: user.name, acceptedCount, capacity } as const;
  });

  if ("error" in outcome) return { error: outcome.error };

  const { project, userName, acceptedCount, capacity } = outcome;
  if (decision === "ACCEPT") {
    await createNotifications([
      {
        userId,
        type: "INFO",
        ...startNotice(project, `"${project.title}" 평가에 추가 선발되었어요.`),
        fromUserId: me.id,
      },
    ]);
    await participantAudit(me.id, userId, "PROJECT_PARTICIPANT_ADD", `평가 「${project.title}」 추가 신청 수락`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/surveys");
    return { ok: `${userName}님의 추가 신청을 수락했습니다. (${acceptedCount}/${capacity}명)` };
  }

  await createNotifications([
    {
      userId,
      type: "INFO",
      content: `"${project.title}" 평가의 추가 신청이 선발되지 않았습니다.`,
      fromUserId: me.id,
      link: `/dashboard?view=detail&p=${projectId}`,
    },
  ]);
  await participantAudit(me.id, userId, "PROJECT_PARTICIPANT_REJECT", `평가 「${project.title}」 추가 신청 거절`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/surveys");
  return { ok: `${userName}님의 추가 신청을 거절했습니다.` };
}
