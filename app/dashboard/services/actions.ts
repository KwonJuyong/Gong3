"use server";

import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../../db";
import { isConstructActive, type ServiceProfile } from "../../lib/surveyProfile";
import {
  generateAdaptiveQuestions,
  activeModel,
  PROMPT_VERSION,
  ADAPTIVE_SCALE,
  type GenService,
} from "../../lib/llmGenerate";
import {
  type SurveyBlock,
  adaptiveKey,
  instrumentKey,
  vignetteKey,
} from "../../lib/surveyBlocks";
import { notifyAdminsForReview } from "../../lib/approvals";

const SERVICES_PATH = "/dashboard/services";

async function getMe() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** 서비스 등록은 DEVELOPER 또는 ADMIN */
function canManageService(role: string) {
  return role === "DEVELOPER" || role === "ADMIN";
}

const ALLOWED_MODALITY = ["text", "image", "voice", "multimodal"];

export async function createServiceAction(formData: FormData) {
  const me = await getMe();
  if (!me || !canManageService(me.role)) return;

  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return;

  const presetRaw = ((formData.get("preset") as string) || "").trim();
  const preset = presetRaw || null;

  const modalityRaw = ((formData.get("modality") as string) || "text").trim();
  const modality = ALLOWED_MODALITY.includes(modalityRaw) ? modalityRaw : "text";

  const service = await prisma.service.create({
    data: {
      name,
      ownerId: me.id,
      preset,
      modality,
      isAiService: formData.get("isAiService") === "on",
      hasRecommendation: formData.get("hasRecommendation") === "on",
      isSafetyCritical: formData.get("isSafetyCritical") === "on",
      hasPersonalData: formData.get("hasPersonalData") === "on",
      userFacingUi: formData.get("userFacingUi") === "on",
    },
  });

  revalidatePath(SERVICES_PATH);
  // 등록 다음 단계인 설문 작성으로 바로 보냄
  redirect(`${SERVICES_PATH}/${service.id}?created=1`);
}

export async function deleteServiceAction(formData: FormData) {
  const me = await getMe();
  if (!me || !canManageService(me.role)) return;

  const id = ((formData.get("serviceId") as string) || "").trim();
  if (!id) return;

  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) return;
  // 소유자 본인 또는 관리자만 삭제 가능
  if (service.ownerId !== me.id && me.role !== "ADMIN") return;

  await prisma.service.delete({ where: { id } });

  revalidatePath(SERVICES_PATH);
  redirect(`${SERVICES_PATH}?deleted=1`);
}

/** 소유자 본인 또는 ADMIN 인지 확인하고 서비스를 반환 */
async function getOwnedService(serviceId: string, me: { id: string; role: string }) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return null;
  if (service.ownerId !== me.id && me.role !== "ADMIN") return null;
  return service;
}

/** 활성 LLM 문항 구성개념의 문구를 생성/갱신 */
export async function generateDraftsAction(formData: FormData) {
  const me = await getMe();
  if (!me || !canManageService(me.role)) return;

  const serviceId = ((formData.get("serviceId") as string) || "").trim();
  if (!serviceId) return;
  const service = await getOwnedService(serviceId, me);
  if (!service) return;

  // 작성 중(DRAFT) 설문 버전. 없으면 회차 1 을 만듦
  let version = await prisma.surveyVersion.findFirst({
    where: { serviceId, status: "DRAFT" },
    orderBy: { round: "desc" },
  });
  if (!version) {
    const last = await prisma.surveyVersion.findFirst({
      where: { serviceId },
      orderBy: { round: "desc" },
      select: { round: true },
    });
    version = await prisma.surveyVersion.create({
      data: { serviceId, round: (last?.round || 0) + 1, status: "DRAFT" },
    });
  }

  const profile: ServiceProfile = {
    isAiService: service.isAiService,
    hasRecommendation: service.hasRecommendation,
    isSafetyCritical: service.isSafetyCritical,
    hasPersonalData: service.hasPersonalData,
    userFacingUi: service.userFacingUi,
    preset: service.preset,
    modality: service.modality,
  };

  // LLM 적응 대상 = 활성 구성개념 중 검증도구가 없는(instrument=null) 것
  const all = await prisma.construct.findMany({
    where: { active: true, instrument: null },
    orderBy: { sortOrder: "asc" },
  });
  const targets = all.filter((c) => isConstructActive(c, profile));
  if (targets.length === 0) {
    revalidatePath(`${SERVICES_PATH}/${serviceId}`);
    redirect(`${SERVICES_PATH}/${serviceId}?generated=0`);
  }

  const genService: GenService = {
    name: service.name,
    preset: service.preset,
    modality: service.modality,
    isAiService: service.isAiService,
    hasRecommendation: service.hasRecommendation,
    isSafetyCritical: service.isSafetyCritical,
    hasPersonalData: service.hasPersonalData,
    userFacingUi: service.userFacingUi,
  };
  const results = await generateAdaptiveQuestions(
    genService,
    targets.map((c) => ({ id: c.id, name: c.name, description: c.description })),
  );

  // 생성 문구 upsert. 수정본과 승인 상태는 유지하고 generated 만 갱신함
  for (const r of results) {
    await prisma.llmQuestionDraft.upsert({
      where: { surveyVersionId_constructId: { surveyVersionId: version.id, constructId: r.constructId } },
      update: { generated: r.questionText, scaleType: ADAPTIVE_SCALE },
      create: {
        surveyVersionId: version.id,
        constructId: r.constructId,
        generated: r.questionText,
        scaleType: ADAPTIVE_SCALE,
      },
    });
  }

  // 재현을 위해 사용 모델과 프롬프트 판본을 기록함
  await prisma.surveyVersion.update({
    where: { id: version.id },
    data: { llmModelId: activeModel(), promptVersion: PROMPT_VERSION },
  });

  revalidatePath(`${SERVICES_PATH}/${serviceId}`);
  redirect(`${SERVICES_PATH}/${serviceId}?generated=1`);
}

/** LLM 이 만든 문구를 수정·확정함 */
export async function saveDraftAction(formData: FormData) {
  const me = await getMe();
  if (!me || !canManageService(me.role)) return;

  const draftId = ((formData.get("draftId") as string) || "").trim();
  if (!draftId) return;

  const draft = await prisma.llmQuestionDraft.findUnique({
    where: { id: draftId },
    include: { surveyVersion: { include: { service: true } } },
  });
  if (!draft) return;
  const service = draft.surveyVersion.service;
  if (service.ownerId !== me.id && me.role !== "ADMIN") return;

  const editedRaw = ((formData.get("edited") as string) || "").trim();
  const approved = formData.get("approved") === "on";

  await prisma.llmQuestionDraft.update({
    where: { id: draftId },
    data: { edited: editedRaw || null, approved },
  });

  revalidatePath(`${SERVICES_PATH}/${service.id}`);
  redirect(`${SERVICES_PATH}/${service.id}?saved=1`);
}

/** DRAFT 버전을 최종 블록으로 조립·스냅샷하고 CONFIRMED로 잠금 */
export async function freezeVersionAction(formData: FormData) {
  const me = await getMe();
  if (!me || !canManageService(me.role)) return;

  const serviceId = ((formData.get("serviceId") as string) || "").trim();
  if (!serviceId) return;
  const service = await getOwnedService(serviceId, me);
  if (!service) return;

  const version = await prisma.surveyVersion.findFirst({
    where: { serviceId, status: "DRAFT" },
    orderBy: { round: "desc" },
    include: { drafts: true },
  });
  if (!version) {
    redirect(`${SERVICES_PATH}/${serviceId}?frozen=none`);
  }

  // 승인하지 않은 문구가 있으면 화면에서 명시적으로 체크했을 때만 동결함(동결은 되돌릴 수 없음).
  const unapproved = version.drafts.filter((d) => !d.approved).length;
  if (unapproved > 0 && formData.get("allowUnapproved") !== "on") {
    redirect(`${SERVICES_PATH}/${serviceId}?frozen=unapproved&n=${unapproved}`);
  }

  const profile: ServiceProfile = {
    isAiService: service.isAiService,
    hasRecommendation: service.hasRecommendation,
    isSafetyCritical: service.isSafetyCritical,
    hasPersonalData: service.hasPersonalData,
    userFacingUi: service.userFacingUi,
    preset: service.preset,
    modality: service.modality,
  };

  const constructs = (
    await prisma.construct.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
  ).filter((c) => isConstructActive(c, profile));

  const draftByConstruct = new Map(version.drafts.map((d) => [d.constructId, d]));
  const blocks: SurveyBlock[] = [];
  const instrumentVersions: Record<string, string> = {};

  for (const c of constructs) {
    if (!c.instrument) {
      // LLM 적응 문항: 수정본이 있으면 그것을, 없으면 생성본을 씀
      const d = draftByConstruct.get(c.id);
      if (!d) continue;
      blocks.push({
        kind: "LLM_ADAPTIVE",
        constructId: c.id,
        constructName: c.name,
        scaleType: d.scaleType,
        itemKey: adaptiveKey(c.id),
        text: (d.edited || d.generated).trim(),
        // 응답 주체를 블록에 실어야 평가 변환에서 개발사 문항을 걸러낼 수 있음
        evaluator: c.evaluator,
      });
    } else {
      // 검증도구: 원문 문항이 시드돼 있을 때만 블록을 만듦(현재 UEQ)
      const items = await prisma.instrumentItem.findMany({
        where: { instrument: c.instrument, locale: "ko" },
        orderBy: { ordinal: "asc" },
      });
      if (items.length === 0) continue;
      instrumentVersions[c.instrument] = items[0].version;
      blocks.push({
        kind: "INSTRUMENT",
        instrument: c.instrument,
        constructId: c.id,
        constructName: c.name,
        scaleType: items[0].scaleType,
        items: items.map((it) => ({
          itemKey: instrumentKey(c.instrument as string, it.ordinal),
          ordinal: it.ordinal,
          text: it.text,
          leftLabel: it.leftLabel,
          rightLabel: it.rightLabel,
          dimension: it.dimension,
          reverse: it.reverse,
        })),
      });
    }
  }

  // 앵커링 비네트 블록(활성 구성개념 중 비네트 보유분)
  const activeIds = constructs.map((c) => c.id);
  const vignettes = await prisma.vignette.findMany({
    where: { active: true, constructId: { in: activeIds } },
    orderBy: [{ constructId: "asc" }, { level: "asc" }],
  });
  const vigByConstruct = new Map<string, typeof vignettes>();
  for (const v of vignettes) {
    const arr = vigByConstruct.get(v.constructId) || [];
    arr.push(v);
    vigByConstruct.set(v.constructId, arr);
  }
  for (const c of constructs) {
    const vs = vigByConstruct.get(c.id);
    if (!vs || vs.length === 0) continue;
    blocks.push({
      kind: "VIGNETTE",
      constructId: c.id,
      constructName: c.name,
      scaleType: "LIKERT_5",
      items: vs.map((v) => ({
        itemKey: vignetteKey(c.id, v.level),
        level: v.level,
        text: v.text,
      })),
    });
  }

  const constructSnapshot = constructs.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group,
    instrument: c.instrument,
    evaluator: c.evaluator,
  }));

  await prisma.surveyVersion.update({
    where: { id: version.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: me.id,
      blocks: blocks as object,
      instrumentVersions: instrumentVersions as object,
      constructSnapshot: constructSnapshot as object,
    },
  });

  // 동결은 공개가 아님. 관리자에게 검토를 요청하고, 공개는 평가를 만들어 승인받은 뒤에 됨
  await notifyAdminsForReview({ title: `${service.name} · 회차 ${version.round}`, requesterId: me.id });

  revalidatePath(`${SERVICES_PATH}/${serviceId}`);
  redirect(`${SERVICES_PATH}/${serviceId}?frozen=1`);
}
