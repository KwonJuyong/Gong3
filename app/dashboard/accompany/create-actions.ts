"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, getSessionUser } from "@/app/db";
import { notifyAdminsForReview } from "@/app/lib/approvals";
import { parseFundingType, strOrNull, linkOrder, normalizeUrl, parseEnrollmentDeadline } from "@/app/lib/projectForm";
import { parseProjectGuides } from "@/app/lib/projectGuides";

const canCreate = (role: string) => role === "DEVELOPER" || role === "ADMIN";

/**
 * 동행 평가 1단계. 평가 대상만 받아 작성 중(DRAFT) 평가를 만들고 Evi 과제 인터뷰로 보냄.
 * 서비스 기록은 의뢰(Order.serviceId)·목록 묶음에만 쓰여 이름으로 찾거나 만들고, 유형은 묻지 않음
 */
export async function startAccompanyAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || !canCreate(me.role)) return;
  const name = ((formData.get("serviceName") as string) || "").trim().slice(0, 100);
  if (!name) redirect("/dashboard/accompany/new?error=name");
  const date = (formData.get("d") as string) || "";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T10:00:00+09:00`)
    : new Date(Date.now() + 24 * 3600 * 1000);

  const service =
    (await prisma.service.findFirst({ where: { ownerId: me.id, name }, select: { id: true } })) ??
    (await prisma.service.create({ data: { name, ownerId: me.id }, select: { id: true } }));
  const project = await prisma.project.create({
    data: {
      title: name,
      status: "DRAFT",
      evalMode: "ACCOMPANY",
      serviceId: service.id,
      link: normalizeUrl((formData.get("link") as string) || ""),
      questions: [],
      startTime: start,
      creatorId: me.id,
    },
  });
  redirect(`/dashboard?view=task&p=${project.id}&saved=draft`);
}

/** 동행 평가 마지막 단계. 모집·비용을 정해 승인을 요청함. 과제 내용이 저장돼 있어야 함 */
export async function requestAccompanyApprovalAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || !canCreate(me.role)) return;
  const projectId = ((formData.get("projectId") as string) || "").trim();
  const project = await prisma.project.findFirst({
    where: { id: projectId, evalMode: "ACCOMPANY", status: "DRAFT", ...(me.role === "ADMIN" ? {} : { creatorId: me.id }) },
    select: { id: true, title: true, scenario: { select: { projectId: true } } },
  });
  if (!project) redirect("/dashboard");
  if (!project.scenario) redirect(`/dashboard?view=task&p=${projectId}&error=brief`);

  const date = (formData.get("date") as string) || "";
  const time = (formData.get("time") as string) || "10:00";
  const minParticipants = Math.max(1, parseInt((formData.get("minParticipants") as string) || "1", 10) || 1);
  const maxParticipants = Math.max(minParticipants, parseInt((formData.get("maxParticipants") as string) || "10", 10) || 10);
  const title = ((formData.get("title") as string) || "").trim();
  const guides = parseProjectGuides(formData.get("guides"));

  const updated = await prisma.project.updateMany({
    where: { id: projectId, status: "DRAFT" },
    data: {
      ...(title ? { title } : {}),
      description: strOrNull(formData, "description"),
      guides,
      location: strOrNull(formData, "location") ?? "미정",
      ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { startTime: new Date(`${date}T${time}:00+09:00`) } : {}),
      minParticipants,
      maxParticipants,
      enrollmentDeadline: parseEnrollmentDeadline(formData),
      fundingType: parseFundingType(formData),
      contractRef: strOrNull(formData, "contractRef"),
      fundRef: strOrNull(formData, "fundRef"),
      status: "PENDING_APPROVAL",
    },
  });
  if (updated.count === 0) redirect(`/dashboard?view=task&p=${projectId}`);
  await linkOrder(strOrNull(formData, "orderId"), projectId, me);
  await notifyAdminsForReview({ title: title || project.title, requesterId: me.id });

  revalidatePath("/dashboard");
  redirect(`/dashboard?view=task&p=${projectId}&saved=requested`);
}
