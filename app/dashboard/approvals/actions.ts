"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, getSessionUser } from "../../db";
import { notifyEveryonePublished, notifyCreatorRejected } from "../../lib/approvals";
import { backfillRewardsForOrder } from "../../lib/rewards";

/**
 * 평가 승인·반려·발주 연결·자금 기록(ADMIN 전용).
 *
 *   승인      → 공개되고 학생 전체에게 알림이 나간다
 *   발주 연결 → 정원·단가를 발주 값으로 쓰고 기존 응답의 보상을 소급 생성한다
 *   자금 기록 → 장부용 기록이며 공개와 무관하다
 *
 * 승인은 전체 알림을 보내므로 조건부 updateMany(CAS)로 한 번만 처리한다.
 */

const PATH = "/dashboard/approvals";

async function requireAdmin() {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return null;
  return me;
}

function reasonOf(formData: FormData): string {
  return ((formData.get("reason") as string) || "").trim() || "사유 미기재";
}

/** [승인] 평가를 모집 단계로 열고 학생에게 알린다. 자금 상태는 승인 화면을 보고 판단한다. */
export async function approveProjectAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const projectId = ((formData.get("projectId") as string) || "").trim();
  if (!projectId) return;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const updated = await prisma.project.updateMany({
    where: { id: projectId, status: "PENDING_APPROVAL" },
    data: {
      status: "RECRUITING",
      approvedAt: new Date(),
      approvedById: me.id,
      rejectedAt: null,
      rejectReason: null,
    },
  });
  if (updated.count === 0) redirect(`${PATH}?already=1`);

  await notifyEveryonePublished({
    title: project.title,
    approverId: me.id,
    creatorId: project.creatorId,
  });

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(`${PATH}?approved=1`);
}

/** [반려] 사유를 생성자에게 알린다. */
export async function rejectProjectAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const projectId = ((formData.get("projectId") as string) || "").trim();
  if (!projectId) return;
  const reason = reasonOf(formData);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const updated = await prisma.project.updateMany({
    where: { id: projectId, status: "PENDING_APPROVAL" },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectReason: reason, approvedById: me.id },
  });
  if (updated.count === 0) redirect(`${PATH}?already=1`);

  await notifyCreatorRejected({
    title: project.title,
    reason,
    approverId: me.id,
    creatorId: project.creatorId,
  });

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(`${PATH}?rejected=1`);
}

/**
 * [자금 기록] 학교(UNIVERSITY) 계약을 확인했다고 기록한다. 공개와 무관하고 알림도 보내지 않는다.
 * 업체 건은 발주 화면의 입금 확인(confirmDeposit)이, 연구비 건은 사후 노무비 청구가 대신한다.
 */
export async function confirmFundingAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const projectId = ((formData.get("projectId") as string) || "").trim();
  if (!projectId) return;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  if (project.fundingType !== "UNIVERSITY") redirect(`${PATH}?company=1`);

  const updated = await prisma.project.updateMany({
    where: { id: projectId, fundConfirmedAt: null },
    data: { fundConfirmedAt: new Date(), fundConfirmedById: me.id },
  });
  if (updated.count === 0) redirect(`${PATH}?already=1`);

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(`${PATH}?funded=1`);
}

/**
 * [발주 연결] 이미 만든 평가에 발주를 붙인다.
 * 연결하면 정원·단가를 발주 값으로 쓰므로, 그 전에 들어온 응답의 보상을 소급 생성한다.
 * 한 발주는 한 평가에만 연결된다(projectId unique).
 */
export async function linkOrderToProjectAction(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;

  const projectId = ((formData.get("projectId") as string) || "").trim();
  const orderId = ((formData.get("orderId") as string) || "").trim();
  if (!projectId || !orderId) return;

  // 이미 발주가 붙은 평가는 덮어쓰지 않는다(단가가 바뀌면 기존 보상과 어긋난다).
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { order: { select: { id: true } } },
  });
  if (!project || project.order) redirect(`${PATH}?already=1`);

  const linked = await prisma.order.updateMany({
    where: { id: orderId, projectId: null },
    data: { projectId },
  });
  if (linked.count === 0) redirect(`${PATH}?taken=1`);

  // 연결 전에 들어와 있던 응답의 보상을 소급 생성한다(입금 완료된 발주일 때만 생긴다).
  await backfillRewardsForOrder(orderId);

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(`${PATH}?linked=1`);
}
