"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, getSessionUser } from "../db";
import { createNotifications } from "../lib/notify";
// 승인·반려 액션은 app/dashboard/approvals/actions.ts 에 있다.
import { notifyAdminsForReview, capacityOf, FUNDING_TYPES } from "../lib/approvals";
import { createRewardForResponse } from "../lib/rewards";
import { type SurveyBlock } from "../lib/surveyBlocks";
import {
  blocksToProjectQuestions,
  questionKey,
  type ProjectQuestion,
} from "../lib/projectQuestions";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 자금 출처를 폼에서 읽는다. 알 수 없는 값이면 입금 확인이 필요한 업체(COMPANY)로 본다.
 */
function parseFundingType(formData: FormData): string {
  const raw = ((formData.get("fundingType") as string) || "").trim();
  return FUNDING_TYPES.includes(raw as (typeof FUNDING_TYPES)[number]) ? raw : "COMPANY";
}

function strOrNull(formData: FormData, key: string): string | null {
  return ((formData.get(key) as string) || "").trim() || null;
}

/**
 * 발주를 평가에 연결한다(선택 사항). 연결 전에는 보상이 생기지 않으며,
 * 나중에 승인 화면에서 연결할 수도 있다(linkOrderToProjectAction).
 * 본인 발주(또는 ADMIN)만 연결할 수 있고, 한 발주는 한 평가에만 붙는다(projectId unique).
 */
async function linkOrder(
  orderId: string | null,
  projectId: string,
  me: { id: string; role: string },
): Promise<void> {
  if (!orderId) return;
  const where =
    me.role === "ADMIN"
      ? { id: orderId, projectId: null }
      : { id: orderId, projectId: null, buyerId: me.id };
  await prisma.order.updateMany({ where, data: { projectId } });
}

function normalizeUrl(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function parseQuestions(formData: FormData) {
  const questions: any[] = [];
  let i = 0;
  while (formData.has(`q_label_${i}`)) {
    const label = ((formData.get(`q_label_${i}`) as string) || "").trim();
    const type = (formData.get(`q_type_${i}`) as string) || "text";
    const rawOptions = (formData.get(`q_options_${i}`) as string) || "";
    const options = rawOptions.split("\n").map((s) => s.trim()).filter(Boolean);
    if (label) {
      const q: any = { id: i, label, type };
      if (type === "dropdown" || type === "checkbox") q.options = options;
      questions.push(q);
    }
    i++;
  }
  return questions;
}

/** 신청 마감 일시. 날짜가 없으면 마감 없음. 수동·자동 생성이 같은 규칙을 쓴다. */
function parseEnrollmentDeadline(formData: FormData): Date | null {
  const d = (formData.get("enrollmentDeadlineDate") as string) || "";
  const t = (formData.get("enrollmentDeadlineTime") as string) || "";
  return d ? new Date(`${d}T${t || "23:59"}:00+09:00`) : null;
}

/** [평가 생성: DEVELOPER 또는 ADMIN] **/
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
      // 관리자가 승인해야 모집이 시작된다.
      status: "PENDING_APPROVAL",
      // 문항 출처: 직접 입력. 자금 출처는 fundingType 이 따로 정한다.
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

  // 관리자에게 검토를 요청한다. 학생 알림은 승인 때 보낸다.
  await notifyAdminsForReview({ title, requesterId: me.id });

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

/** [평가 수정: ADMIN 또는 생성자] **/
export async function updateProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  // 문항은 편집기를 보냈을 때(editQuestions=1)만 바꾼다. 표준 구성 문항(itemKey)이 있거나
  // 응답이 있으면 바꾸지 않는다. 수동 편집기가 표준 문항을 표현하지 못하고, 응답 키가
  // 배열 인덱스라 문항을 지우면 기존 응답이 다른 문항에 붙기 때문이다.
  const questionsLocked =
    (await prisma.response.count({ where: { projectId } })) > 0 ||
    ((project.questions as unknown as { itemKey?: string }[]) || []).some((q) => !!q?.itemKey);
  const questions =
    formData.get("editQuestions") === "1" && !questionsLocked ? parseQuestions(formData) : undefined;
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

  await prisma.project.update({
    where: { id: projectId },
    data: { title, description, location, startTime, link, ...(questions ? { questions } : {}) },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** [평가 참여 제출 / 수정: 선발된 신청자만, ACTIVE 프로젝트만] **/
export async function submitResponseAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      enrollments: { select: { userId: true, status: true } },
      // 정원·보상 단가. 발주가 없으면 Project 값을 쓴다.
      order: { select: { panelSize: true, rewardPerPerson: true } },
    },
  });
  // 모집중(RECRUITING)에는 응답을 받지 않는다
  if (!project || project.status !== "ACTIVE") return;

  const isAccepted = project.enrollments.some(
    (e) => e.userId === me.id && e.status === "ACCEPTED"
  );
  if (!isAccepted) return;

  // 응답 키는 questionKey() 로 만든다(수동 문항은 인덱스, 설문 원본 문항은 itemKey).
  const projectQuestions = (project.questions as unknown as ProjectQuestion[]) || [];
  const allowed = new Set<string>();
  projectQuestions.forEach((q, i) => {
    const k = questionKey(q, i);
    allowed.add(k);
    // 서술형 개선 의견은 점수와 별도 키로 들어온다.
    if (q?.itemKey && q.comment) allowed.add(`text:${q.itemKey}`);
  });

  const answers: Record<string, any> = {};
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("answer_")) continue;
    const k = key.slice("answer_".length);
    // 문항에 없는 키는 버린다.
    if (!allowed.has(k)) continue;
    if (answers[k] === undefined) answers[k] = val;
    else if (Array.isArray(answers[k])) answers[k].push(val);
    else answers[k] = [answers[k], val];
  }

  // 기존 응답이 있으면 수정, 없으면 새로 생성
  const existing = await prisma.response.findFirst({
    where: { projectId, userId: me.id },
  });

  if (existing) {
    // 수정은 정원·보상에 영향이 없다.
    await prisma.response.update({ where: { id: existing.id }, data: { answers } });
    revalidatePath("/dashboard");
    // 처리 결과를 안내한다.
    redirect("/dashboard?answered=updated");
  }

  // 정원을 넘는 응답은 받지 않는다. 동시 제출에 대비해 보상 생성에서도 한 번 더 확인한다.
  const capacity = capacityOf(project);
  const answered = await prisma.response.count({ where: { projectId } });
  if (project.closedAt || answered >= capacity) {
    redirect("/dashboard?full=1");
  }

  const created = await prisma.response.create({
    data: { projectId, userId: me.id, answers },
  });

  // 유상 평가면 보상을 만든다(연구비 건은 만들지 않는다).
  await createRewardForResponse(created.id);

  // 정원이 차면 응답을 마감한다.
  if (answered + 1 >= capacity) {
    await prisma.project.updateMany({
      where: { id: projectId, closedAt: null },
      data: { closedAt: new Date() },
    });
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?answered=1");
}

/** [평가 종료: ADMIN 또는 생성자] **/
export async function finishProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { responses: { select: { userId: true } } },
  });
  if (!project) return;

  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "FINISHED", endTime: new Date() },
  });

  const participantIds = [...new Set(project.responses.map((r) => r.userId))];
  if (participantIds.length > 0) {
    await createNotifications(
      participantIds.map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `참여한 평가가 종료되었습니다: ${project.title}`,
      })),
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** [평가 삭제: ADMIN] **/
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

/** [참여 신청] **/
export async function enrollProjectAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { enrollments: true },
  });
  // 신청은 모집 중에만 받는다(시작 후 신청은 선발을 거칠 수 없다).
  if (!project || project.status !== "RECRUITING") return;

  if (project.enrollmentDeadline && new Date() > project.enrollmentDeadline) return;
  // 신청은 정원을 넘어도 받고, 정원은 선발할 때 적용한다.

  const existing = await prisma.enrollment.findUnique({
    where: { projectId_userId: { projectId, userId: me.id } },
  });
  if (existing) return;

  await prisma.enrollment.create({ data: { projectId, userId: me.id, status: "PENDING" } });

  const notifyUserIds = new Set<string>();
  if (project.creatorId) notifyUserIds.add(project.creatorId);
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  admins.forEach((a) => notifyUserIds.add(a.id));
  notifyUserIds.delete(me.id);

  if (notifyUserIds.size > 0) {
    // 신청마다 가는 알림이라 푸시는 보내지 않고 인앱에만 쌓는다.
    await createNotifications(
      Array.from(notifyUserIds).map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `${me.name}(${me.studentId})님이 "${project.title}" 평가에 참여 신청했습니다. (신청 ${project.enrollments.length + 1}명 · 정원 ${project.maxParticipants}명)`,
      })),
      { push: false },
    );
  }

  revalidatePath("/dashboard");
  // 같은 평가 상세로 돌아가 바뀐 상태를 보여준다.
  redirect(`/dashboard?view=detail&p=${projectId}`);
}

/**
 * [참여 신청 취소]
 * 모집 중이거나 선발되지 않은 신청만 취소할 수 있다. 평가가 시작된 뒤 선발된 사람의 제외는
 * 관리자가 removeParticipantAction 으로 한다.
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
    // 조회와 삭제 사이에 선발이 확정됐으면 지우지 않도록 조건을 다시 건다.
    where: {
      projectId,
      userId: me.id,
      ...(project.status === "RECRUITING" ? {} : { status: { in: ["PENDING", "REJECTED"] } }),
    },
  });

  revalidatePath("/dashboard");
  // 같은 평가 상세로 돌아가 바뀐 상태를 보여준다.
  redirect(`/dashboard?view=detail&p=${projectId}`);
}

/**
 * [참여자 선발: ADMIN 또는 생성자]
 * 체크된 신청자를 ACCEPTED, 나머지를 REJECTED 로 확정한다.
 * formData.start === "1" 이면 선발 확정과 동시에 평가를 시작(RECRUITING → ACTIVE)한다.
 */
export async function selectParticipantsAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { enrollments: { select: { userId: true, status: true } } },
  });
  // 선발은 모집 중에만 한다. 진행 중에 실행하면 체크하지 않은 응답자까지 REJECTED 가 된다.
  // 진행 중 인원 조정은 제외·추가 액션으로 한다.
  if (!project || project.status !== "RECRUITING") return;
  if (me.role !== "ADMIN" && project.creatorId !== me.id) return;

  // 체크박스는 선택된 항목만 전송되므로 나머지는 비선발이다
  const acceptedIds = new Set(formData.getAll("accepted").map((v) => String(v)));
  const enrolledIds = new Set(
    project.enrollments.filter((e) => e.status !== "REMOVED").map((e) => e.userId),
  );
  // 신청하지 않은 사용자가 섞여 들어오는 것을 막는다
  const accepted = [...acceptedIds].filter((id) => enrolledIds.has(id));
  const rejected = [...enrolledIds].filter((id) => !acceptedIds.has(id));

  if (accepted.length > project.maxParticipants) return;

  const start = (formData.get("start") as string) === "1";
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

  // 평가를 시작할 때만 결과를 통보한다(선발 도중의 체크 변경으로 알림이 쏟아지지 않도록)
  if (start) {
    const notifications = [
      ...accepted.map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `"${project.title}" 평가에 선발되었습니다. 지금부터 응답할 수 있습니다.`,
        fromUserId: me.id,
      })),
      ...rejected.map((uid) => ({
        userId: uid,
        type: "INFO",
        content: `"${project.title}" 평가는 정원이 마감되어 이번에는 참여하지 못하게 되었습니다.`,
        fromUserId: me.id,
      })),
    ];
    if (notifications.length > 0) {
      await createNotifications(notifications);
    }
  }

  revalidatePath("/dashboard");
  redirect(start ? "/dashboard" : `/dashboard?view=recruit&p=${projectId}`);
}

/** [자동 생성: 확정 설문에서 평가 생성] */
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
  if (version.service.ownerId !== me.id && me.role !== "ADMIN") return;

  // 설문 → 평가 문항 변환은 projectQuestions.ts 에서 한다.
  const blocks = (version.blocks as unknown as SurveyBlock[]) || [];
  const snapshot =
    (version.constructSnapshot as unknown as { id: string; evaluator?: string | null }[]) || [];
  // Prisma Json 입력 타입이 인덱스 시그니처를 요구해서 캐스팅한다.
  const questions = blocksToProjectQuestions(blocks, snapshot) as unknown as object[];

  const title = ((formData.get("title") as string) || version.service.name).trim();
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
      // 관리자가 승인해야 모집이 시작된다.
      status: "PENDING_APPROVAL",
      // 문항 출처: 서비스 설문에서 자동 생성. 원본 회차를 남긴다.
      questionSource: "AUTO",
      surveyVersionId: version.id,
      fundingType: parseFundingType(formData),
      contractRef: strOrNull(formData, "contractRef"),
      fundRef: strOrNull(formData, "fundRef"),
      link: null,
      creatorId: me.id,
      minParticipants,
      maxParticipants,
      enrollmentDeadline: parseEnrollmentDeadline(formData),
    },
  });

  await linkOrder(strOrNull(formData, "orderId"), project.id, me);

  // 관리자에게 검토를 요청한다. 학생 알림은 승인 때 보낸다.
  await notifyAdminsForReview({ title: project.title, requesterId: me.id });

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

/**
 * [신청 복구: ADMIN 또는 생성자] 실수로 취소한 참여 신청 한 건을 되살린다.
 * 되살린 신청은 PENDING 이고 선발 때 정원이 적용된다. 이미 신청이 있으면 아무것도 하지 않는다.
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
  // 선발은 모집 중에만 하므로, 진행 중인 평가는 addParticipantAction 으로 추가한다.
  if (project.status !== "RECRUITING") {
    return { error: "모집 중인 평가에서만 복구할 수 있습니다. 진행 중인 평가는 관리자가 「참여자 추가」로 넣어 주세요." };
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
 * - 제외는 행을 지우지 않고 status = "REMOVED" 로 남긴다. 제외된 사람은 응답을 제출할 수 없다.
 * - 이미 응답한 사람은 보상이 붙어 있어 제외하지 않는다.
 * - 정원은 capacityOf() 로 판정한다(발주가 있으면 발주 인원).
 * - 모든 조작은 AuditLog 에 남는다.
 */
export interface ParticipantState {
  ok?: string;
  error?: string;
}

async function participantAudit(actorId: string, targetId: string, action: string, summary: string) {
  // 기록에 실패해도 이미 끝난 조작은 되돌리지 않는다.
  try {
    await prisma.auditLog.create({ data: { actorId, targetId, action, summary } });
  } catch {
    /* 무시 */
  }
}

/** [참여자 제외: ADMIN] 선발된 사람을 진행 중인 평가에서 뺀다. */
export async function removeParticipantAction(
  _prev: ParticipantState | null,
  formData: FormData,
): Promise<ParticipantState> {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return { error: "관리자만 참여자를 제외할 수 있습니다." };

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

  // 조건부 갱신. 이미 처리됐으면 0건이다.
  const updated = await prisma.enrollment.updateMany({
    where: { projectId, userId, status: "ACCEPTED" },
    data: { status: "REMOVED" },
  });
  if (updated.count === 0) return { error: `${user.name}님은 현재 선발 상태가 아닙니다.` };

  // 확인과 갱신 사이에 응답이 들어왔으면 되돌린다.
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
    `평가 「${project.title}」 참여자 제외${reason ? ` — 사유: ${reason}` : ""}`,
  );

  revalidatePath("/dashboard");
  return { ok: `${user.name}님을 제외했습니다. 빈 자리에 다른 참여자를 추가할 수 있습니다.` };
}

/** [참여자 추가: ADMIN] 진행 중인 평가에 바로 선발(ACCEPTED) 상태로 넣는다. */
export async function addParticipantAction(
  _prev: ParticipantState | null,
  formData: FormData,
): Promise<ParticipantState> {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return { error: "관리자만 참여자를 추가할 수 있습니다." };

  const projectId = (formData.get("projectId") as string) || "";
  const loginId = ((formData.get("loginId") as string) || "").trim();
  if (!projectId || !loginId) return { error: "학번 또는 이메일을 입력해주세요." };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      order: { select: { panelSize: true } },
      enrollments: { where: { status: "ACCEPTED" }, select: { userId: true } },
    },
  });
  if (!project) return { error: "평가를 찾을 수 없습니다." };
  if (project.status !== "ACTIVE") return { error: "진행 중인 평가에서만 추가할 수 있습니다." };
  // 마감된 평가는 추가해도 응답할 수 없다.
  if (project.closedAt) return { error: "응답이 마감된 평가라 추가해도 응답할 수 없습니다." };

  const capacity = capacityOf(project);
  if (project.enrollments.length >= capacity) {
    return { error: `정원(${capacity}명)이 찼습니다. 먼저 참여하지 않는 사람을 제외해 주세요.` };
  }

  // 이메일과 학번 모두로 찾을 수 있게 한다.
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
  if (existing?.status === "ACCEPTED") return { ok: `${user.name}님은 이미 참여자입니다.` };

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
      content: `"${project.title}" 평가 참여자로 추가되었습니다. 지금부터 응답할 수 있습니다.`,
      fromUserId: me.id,
    },
  ]);
  await participantAudit(
    me.id,
    user.id,
    "PROJECT_PARTICIPANT_ADD",
    `평가 「${project.title}」 참여자 추가${existing ? ` (이전 상태 ${existing.status})` : ""}`,
  );

  revalidatePath("/dashboard");
  return { ok: `${user.name}님을 참여자로 추가했습니다. (${project.enrollments.length + 1}/${capacity}명)` };
}
