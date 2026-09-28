/**
 * 설문 원본(SurveyVersion blocks)을 평가 문항(Project.questions)으로 바꾸는 곳.
 *
 * 적응 문항(5점 동의 척도), 검증도구(UEQ 등 7점 의미변별), 앵커링 비네트를 모두 옮기고,
 * 각 문항에 itemKey·constructId·척도를 실어 리포트가 구성개념별로 채점할 수 있게 한다.
 * 변환 규칙은 이 파일에만 둔다.
 */

import type { SurveyBlock } from "./surveyBlocks";

/**
 * 문항 유형.
 *
 *   rating·text·dropdown·checkbox·image  수동 생성(직접 입력)
 *   likert5·semantic7                    설문 원본(SurveyVersion)에서 온 것
 *
 * rating(별점)과 likert5(진술문 동의 정도)는 다른 척도다.
 */
export type ProjectQuestionType =
  | "rating"
  | "text"
  | "dropdown"
  | "checkbox"
  | "image"
  | "likert5"
  | "semantic7";

export interface ProjectQuestion {
  /** 수동 문항은 배열 인덱스(숫자), 설문 원본 문항은 itemKey(문자열). */
  id: string | number;
  label: string;
  type: ProjectQuestionType;
  options?: string[];

  // 아래는 설문 원본에서 온 문항만 채워진다
  /** 채점 키. `adaptive:security` · `UEQ:3` · `vignette:security:1` */
  itemKey?: string;
  constructId?: string;
  /** 화면 구획 제목. 같은 값끼리 한 카드로 묶인다. */
  section?: string;
  /** 구획 첫머리 안내문. 구획의 첫 문항에만 붙인다. */
  sectionHint?: string;
  /** semantic7 양극 라벨 */
  leftLabel?: string;
  rightLabel?: string;
  /** 서술형 개선 의견 칸을 함께 띄울지 */
  comment?: boolean;
}

/** 5점 동의 척도 라벨. 응답 화면과 리포트가 같은 배열을 쓴다. */
export const LIKERT5_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통",
  "그렇다",
  "매우 그렇다",
];

/**
 * 응답 키. 응답 화면·서버 액션·리포트가 모두 이 함수를 쓴다.
 * 수동 문항은 배열 인덱스, 설문 원본 문항은 itemKey.
 */
export function questionKey(q: unknown, index: number): string {
  // 호출부마다 문항 타입이 조금씩 달라 unknown 으로 받아 여기서 좁힌다.
  const itemKey = (q as { itemKey?: unknown } | null | undefined)?.itemKey;
  return typeof itemKey === "string" && itemKey ? itemKey : String(index);
}

/** 서술형 개선 의견의 응답 키. 점수 키와 섞이지 않게 접두사를 붙인다. */
export function commentKey(itemKey: string): string {
  return `text:${itemKey}`;
}

/** 학생이 답하는 문항인지(개발사 자가평가 항목 제외) */
const isEvaluatorItem = (evaluator: string | undefined) =>
  !evaluator || evaluator === "EVALUATOR";

/**
 * 동결된 설문(blocks) → 평가 문항. 순서: 적응 문항 → 검증도구 → 비네트.
 *
 * @param snapshot SurveyVersion.constructSnapshot. 오래된 블록에는 evaluator 가 없어 여기서
 *   보충하고, 없으면 EVALUATOR 로 본다.
 */
export function blocksToProjectQuestions(
  blocks: SurveyBlock[],
  snapshot?: { id: string; evaluator?: string | null }[],
): ProjectQuestion[] {
  const evaluatorOf = new Map<string, string>();
  for (const c of snapshot ?? []) {
    if (c?.id && c.evaluator) evaluatorOf.set(c.id, c.evaluator);
  }

  const out: ProjectQuestion[] = [];

  // 1. LLM 적응 문항: 5점 동의 척도 + 개선 의견
  const adaptive = blocks.filter((b) => b.kind === "LLM_ADAPTIVE");
  let firstAdaptive = true;
  for (const b of adaptive) {
    if (b.kind !== "LLM_ADAPTIVE") continue;
    // 유지보수성처럼 개발사가 답할 구성개념은 학생 문항에서 뺀다.
    const evaluator = b.evaluator ?? evaluatorOf.get(b.constructId);
    if (!isEvaluatorItem(evaluator)) continue;

    out.push({
      id: b.itemKey,
      itemKey: b.itemKey,
      constructId: b.constructId,
      label: b.text,
      type: "likert5",
      section: "서비스 평가",
      sectionHint: firstAdaptive
        ? "각 문장에 얼마나 동의하시는지 골라 주세요."
        : undefined,
      comment: true,
    });
    firstAdaptive = false;
  }

  // 2. 검증도구(UEQ 등): 7점 의미변별. 역문항 정보도 옮긴다.
  for (const b of blocks) {
    if (b.kind !== "INSTRUMENT") continue;
    b.items.forEach((it, i) => {
      out.push({
        id: it.itemKey,
        itemKey: it.itemKey,
        constructId: b.constructId,
        label: it.text,
        type: "semantic7",
        leftLabel: it.leftLabel || it.text,
        rightLabel: it.rightLabel || "",
        section: b.constructName,
        sectionHint:
          i === 0 ? "양쪽 표현 중 더 가깝다고 느끼는 쪽에 표시해 주세요." : undefined,
      });
    });
  }

  // 3. 앵커링 비네트: 가상 시나리오를 같은 척도로 평가해 응답자별 관대성을 보정한다.
  const vignettes = blocks.filter((b) => b.kind === "VIGNETTE");
  let firstVignette = true;
  for (const b of vignettes) {
    if (b.kind !== "VIGNETTE") continue;
    for (const it of b.items) {
      out.push({
        id: it.itemKey,
        itemKey: it.itemKey,
        constructId: b.constructId,
        label: it.text,
        type: "likert5",
        section: "기준 시나리오 평가",
        sectionHint: firstVignette
          ? "아래는 가상의 서비스 상황입니다. 각 상황의 서비스라면 어느 정도일지 위와 같은 기준으로 평가해 주세요."
          : undefined,
      });
      firstVignette = false;
    }
  }

  return out;
}

/**
 * 저장된 응답(Response.answers) → 채점기 입력(RaterRaw).
 * itemKey 가 없는 수동 문항은 채점 대상이 아니라 건너뛴다.
 */
export function answersToRater(
  userId: string,
  questions: ProjectQuestion[],
  answers: Record<string, unknown>,
): { userId: string; scores: Record<string, number>; texts: Record<string, string> } {
  const scores: Record<string, number> = {};
  const texts: Record<string, string> = {};

  questions.forEach((q, i) => {
    if (!q?.itemKey) return; // 수동 문항
    const key = questionKey(q, i);
    const raw = answers[key];
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(Array.isArray(raw) ? raw[0] : raw);
      if (Number.isFinite(n)) scores[q.itemKey] = n;
    }
    const c = answers[commentKey(q.itemKey)];
    if (typeof c === "string" && c.trim()) texts[q.itemKey] = c.trim();
  });

  return { userId, scores, texts };
}
