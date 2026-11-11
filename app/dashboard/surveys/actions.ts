"use server";

import { getSessionUserId } from "@/app/session-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { type SurveyBlock } from "../../lib/surveyBlocks";
import { createRewardForSurveyResponse } from "../../lib/rewards";
import { legacySurveyWhere } from "../../lib/approvals";
import { scaleRange } from "../../lib/projectQuestions";

const SURVEYS_PATH = "/dashboard/surveys";

async function getMe() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** 척도 범위 안의 정수만 점수로 받음. 범위 밖 값은 리포트 평균을 흔듦 */
function parseScore(raw: FormDataEntryValue | null, scaleType: string, uiMax?: number): number | null {
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  const { min, max } = scaleRange(scaleType);
  return n >= Math.min(min, 1) && n <= Math.max(max, uiMax ?? max) ? n : null;
}

/** 동결된 설문에 1인 1회 응답 */
export async function submitResponseAction(formData: FormData) {
  const me = await getMe();
  if (!me) return;

  const versionId = ((formData.get("versionId") as string) || "").trim();
  if (!versionId) return;

  // 목록·상세와 같은 공개 조건을 서버에서도 확인함
  const version = await prisma.surveyVersion.findFirst({
    where: { id: versionId, ...legacySurveyWhere },
  });
  if (!version || !version.blocks) {
    redirect(`${SURVEYS_PATH}?error=unavailable`);
  }

  // 중복 응답 방지
  const existing = await prisma.surveyResponse.findUnique({
    where: { surveyVersionId_userId: { surveyVersionId: versionId, userId: me.id } },
  });
  if (existing) {
    redirect(`${SURVEYS_PATH}?error=duplicate`);
  }

  const blocks = version.blocks as unknown as SurveyBlock[];

  const items: Prisma.SurveyResponseItemCreateManyResponseInput[] = [];
  let expected = 0;

  for (const b of blocks) {
    if (b.kind === "LLM_ADAPTIVE") {
      expected++;
      const score = parseScore(formData.get(b.itemKey), b.scaleType);
      const text = ((formData.get(`text:${b.itemKey}`) as string) || "").trim().slice(0, 5000) || null;
      if (score != null) {
        items.push({
          blockType: "LLM_ADAPTIVE",
          constructId: b.constructId,
          itemKey: b.itemKey,
          score,
          text,
        });
      }
    } else if (b.kind === "INSTRUMENT") {
      for (const it of b.items) {
        expected++;
        // 응답 화면이 검증도구를 척도와 무관하게 1~7 칸으로 그림
        const score = parseScore(formData.get(it.itemKey), b.scaleType, 7);
        if (score != null) {
          items.push({
            blockType: "INSTRUMENT",
            constructId: b.constructId,
            instrument: b.instrument,
            itemKey: it.itemKey,
            score,
          });
        }
      }
    } else if (b.kind === "VIGNETTE") {
      for (const it of b.items) {
        expected++;
        const score = parseScore(formData.get(it.itemKey), b.scaleType);
        if (score != null) {
          items.push({
            blockType: "VIGNETTE",
            constructId: b.constructId,
            itemKey: it.itemKey,
            score,
          });
        }
      }
    }
  }

  if (items.length < expected) {
    redirect(`${SURVEYS_PATH}/${versionId}?incomplete=1`);
  }

  let responseId: string;
  try {
    const created = await prisma.surveyResponse.create({
      data: {
        surveyVersionId: versionId,
        userId: me.id,
        submittedAt: new Date(),
        items: { createMany: { data: items } },
      },
    });
    responseId = created.id;
  } catch {
    redirect(`${SURVEYS_PATH}?error=duplicate`);
  }

  // 유료 평가면 보상(Reward)을 만듦
  await createRewardForSurveyResponse(responseId);

  revalidatePath(SURVEYS_PATH);
  redirect(`${SURVEYS_PATH}?submitted=1`);
}
