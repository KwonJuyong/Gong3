"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/db";
import { getSessionUserId } from "@/app/session-server";
import { sanitizeCertAnswers, type CertServiceFlags } from "@/app/lib/certChecklist";

// 인증 준비 점검 저장. 서비스 소유자 확인은 화면과 별개로 여기서도 한다.

export type SaveCertResult = { ok: true } | { ok: false; error: string };

export async function saveCertReadinessAction(
  serviceId: string,
  answers: unknown,
  note: string,
): Promise<SaveCertResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      ownerId: true,
      isAiService: true,
      hasPersonalData: true,
      isSafetyCritical: true,
    },
  });
  // id 존재 여부가 드러나지 않도록 없는 서비스와 다른 사람의 서비스를 같은 문구로 돌려준다.
  if (!service || (service.ownerId !== userId && me.role !== "ADMIN")) {
    return { ok: false, error: "대상 서비스를 찾을 수 없습니다." };
  }

  const flags: CertServiceFlags = {
    isAiService: service.isAiService,
    hasPersonalData: service.hasPersonalData,
    isSafetyCritical: service.isSafetyCritical,
  };
  // 활성 문항이 아닌 키와 허용되지 않은 값은 버린다.
  const clean = sanitizeCertAnswers(flags, answers);
  const trimmed = note.trim().slice(0, 2000);

  await prisma.certReadiness.upsert({
    where: { serviceId },
    create: { serviceId, answers: clean, note: trimmed || null, updatedById: userId },
    update: { answers: clean, note: trimmed || null, updatedById: userId },
  });

  revalidatePath("/dashboard/certification");
  return { ok: true };
}
