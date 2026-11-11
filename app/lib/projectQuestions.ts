/**
 * 설문 원본(SurveyVersion blocks)을 평가 문항(Project.questions)으로 바꾸는 곳.
 *
 * 적응 문항(5점 동의 척도), 검증도구(UEQ 등 7점 의미변별), 앵커링 비네트를 모두 옮기고,
 * 각 문항에 itemKey·constructId·척도를 실어 리포트가 구성개념별로 채점할 수 있게 함
 * 변환 규칙은 이 파일에만 둠
 */

import type { SurveyBlock } from "./surveyBlocks";

/**
 * 문항 유형.
 *
 *   rating·text·dropdown·checkbox·image  수동 생성(직접 입력)
 *   likert5·semantic7·scale              설문 원본(SurveyVersion)에서 온 것
 *
 * rating(별점)과 likert5(진술문 동의 정도)는 다른 척도임
 * scale 은 검증도구 원래 범위(1~7, 0~10 등)를 그대로 쓰는 숫자 척도임
 */
export type ProjectQuestionType =
  | "rating"
  | "text"
  | "dropdown"
  | "checkbox"
  | "image"
  | "likert5"
  | "semantic7"
  | "scale";

export interface ProjectQuestion {
  /** 수동 문항은 배열 인덱스(숫자), 설문 원본 문항은 itemKey(문자열). */
  id: string | number;
  label: string;
  type: ProjectQuestionType;
  options?: string[];

  // 아래는 설문 원본에서 온 문항만 채워짐
  /** 채점 키. `adaptive:security` · `UEQ:3` · `vignette:security:1` */
  itemKey?: string;
  constructId?: string;
  /** 화면 구획 제목. 같은 값끼리 한 카드로 묶임 */
  section?: string;
  /** 구획 첫머리 안내문. 구획의 첫 문항에만 붙임 */
  sectionHint?: string;
  /** semantic7 양극 라벨, scale 양 끝 라벨 */
  leftLabel?: string;
  rightLabel?: string;
  /** scale 범위 */
  scaleMin?: number;
  scaleMax?: number;
  /** 서술형 개선 의견 칸을 함께 띄울지 */
  comment?: boolean;
}

/** 5점 동의 척도 라벨. 응답 화면과 리포트가 같은 배열을 씀 */
export const LIKERT5_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통",
  "그렇다",
  "매우 그렇다",
];

/** 검증도구 척도 유형별 응답 범위. 채점(surveyScore)도 같은 값을 씀 */
export function scaleRange(scaleType: string): { min: number; max: number } {
  switch (scaleType) {
    case "LIKERT_5":
      return { min: 1, max: 5 };
    case "SCALE_0_10":
      return { min: 0, max: 10 };
    default: // SEMANTIC_7, LIKERT_7
      return { min: 1, max: 7 };
  }
}

/**
 * 응답 키. 응답 화면·서버 액션·리포트가 모두 이 함수를 씀
 * 수동 문항은 배열 인덱스, 설문 원본 문항은 itemKey.
 */
export function questionKey(q: unknown, index: number): string {
  // 호출부마다 문항 타입이 조금씩 달라 unknown 으로 받아 여기서 좁힘
  const itemKey = (q as { itemKey?: unknown } | null | undefined)?.itemKey;
  return typeof itemKey === "string" && itemKey ? itemKey : String(index);
}

/** 서술형 개선 의견의 응답 키. 점수 키와 섞이지 않게 접두사를 붙임 */
export function commentKey(itemKey: string): string {
  return `text:${itemKey}`;
}

/** 서술형 응답 길이 상한 */
export const MAX_TEXT_ANSWER = 5000;

/**
 * 제출된 응답 값이 문항에 맞는지. 응답 화면과 같은 규칙(이미지 외 필수, 척도 범위, 보기 안의 값).
 * 서버에서 다시 보지 않으면 빈 응답에도 보상이 생기고 범위 밖 점수가 평균을 흔듦
 * 알 수 없는 옛 유형은 비지 않은 문자열이면 통과.
 */
export function isValidAnswer(q: ProjectQuestion, v: unknown): boolean {
  const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  if (empty) return q.type === "image";

  const values = Array.isArray(v) ? v : [v];
  if (!values.every((x) => typeof x === "string")) return false;
  if (Array.isArray(v) && q.type !== "checkbox") return false;
  const s = values[0] as string;

  const intIn = (min: number, max: number) => {
    const n = Number(s);
    return /^-?\d+$/.test(s.trim()) && n >= min && n <= max;
  };
  switch (q.type) {
    case "rating":
    case "likert5":
      return intIn(1, 5);
    case "semantic7":
      return intIn(1, 7);
    case "scale":
      return intIn(q.scaleMin ?? 1, q.scaleMax ?? 7);
    case "dropdown":
    case "checkbox":
      return values.every((x) => (q.options || []).includes(x as string));
    case "image":
      // 예전 응답은 /uploads/ 주소로 저장돼 있음(응답을 고쳐 다시 내면 그대로 돌아옴).
      return (s.startsWith("/api/uploads/") || s.startsWith("/uploads/")) && !s.includes("..");
    case "text":
      return s.trim() !== "" && s.length <= MAX_TEXT_ANSWER;
    default:
      return s.trim() !== "" && s.length <= MAX_TEXT_ANSWER;
  }
}

const SCALE_TYPES = new Set(["rating", "likert5", "semantic7", "scale"]);

/**
 * 보상 검수용 불성실 응답 의심 신호. 판정이 아니라 검수자가 응답을 열어 볼 근거임
 * - 일자 응답: 척도 문항 5개 이상이 모두 같은 점수(의미변별은 문항마다 방향이 섞여 있어 특히 드묾)
 * - 짧은 서술: 서술형 답이 모두 5자 미만
 */
export function responseQualityFlags(questions: ProjectQuestion[], answers: Record<string, unknown>): string[] {
  const flags: string[] = [];
  const scale: string[] = [];
  const texts: string[] = [];
  questions.forEach((q, i) => {
    const v = answers[questionKey(q, i)];
    if (typeof v !== "string" || v === "") return;
    if (SCALE_TYPES.has(q.type)) scale.push(v);
    else if (q.type === "text") texts.push(v.replace(/\s/g, ""));
  });
  if (scale.length >= 5 && scale.every((v) => v === scale[0])) {
    flags.push(`일자 응답 의심(척도 ${scale.length}문항 모두 ${scale[0]}점)`);
  }
  if (texts.length > 0 && texts.every((t) => t.length < 5)) {
    flags.push(texts.length === 1 ? "서술형 답 5자 미만" : `서술형 ${texts.length}문항 모두 5자 미만`);
  }
  return flags;
}

/** 학생이 답하는 문항인지(개발사 자가평가 항목 제외) */
const isEvaluatorItem = (evaluator: string | undefined) =>
  !evaluator || evaluator === "EVALUATOR";

/**
 * 동결된 설문(blocks) → 평가 문항. 순서: 적응 문항 → 검증도구 → 비네트.
 *
 * @param snapshot SurveyVersion.constructSnapshot. 오래된 블록에는 evaluator 가 없어 여기서
 *   보충하고, 없으면 EVALUATOR 로 봄
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
    // 유지보수성처럼 개발사가 답할 구성개념은 학생 문항에서 뺌
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

  // 2. 검증도구: 원래 척도 형식을 유지함. 역채점은 surveyScore 가 블록 정보로 함
  for (const b of blocks) {
    if (b.kind !== "INSTRUMENT") continue;
    b.items.forEach((it, i) => {
      const base = {
        id: it.itemKey,
        itemKey: it.itemKey,
        constructId: b.constructId,
        section: b.constructName,
      };
      if (b.scaleType === "SEMANTIC_7") {
        out.push({
          ...base,
          label: it.text,
          type: "semantic7",
          leftLabel: it.leftLabel || it.text,
          rightLabel: it.rightLabel || "",
          sectionHint: i === 0 ? "양쪽 표현 중 더 가깝다고 느끼는 쪽에 표시해 주세요." : undefined,
        });
      } else if (b.scaleType === "LIKERT_5") {
        out.push({
          ...base,
          label: it.text,
          type: "likert5",
          sectionHint: i === 0 ? "각 문장에 얼마나 동의하시는지 골라 주세요." : undefined,
        });
      } else {
        const { min, max } = scaleRange(b.scaleType);
        out.push({
          ...base,
          label: it.text,
          type: "scale",
          scaleMin: min,
          scaleMax: max,
          leftLabel: it.leftLabel || String(min),
          rightLabel: it.rightLabel || String(max),
          sectionHint: i === 0 ? "각 문장이 어느 정도 해당하는지 숫자로 골라 주세요." : undefined,
        });
      }
    });
  }

  // 3. 앵커링 비네트: 가상 시나리오를 같은 척도로 평가해 응답자별 관대성을 보정함
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
 * itemKey 가 없는 수동 문항은 채점 대상이 아니라 건너뜀
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
