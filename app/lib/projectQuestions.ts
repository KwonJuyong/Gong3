import type { SurveyBlock } from "./surveyBlocks";

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
  id: string | number;
  label: string;
  type: ProjectQuestionType;
  options?: string[];
  itemKey?: string;
  constructId?: string;
  section?: string;
  sectionHint?: string;
  leftLabel?: string;
  rightLabel?: string;
  scaleMin?: number;
  scaleMax?: number;
  comment?: boolean;
  dimension?: string;
  reverse?: boolean;
}

export const LIKERT5_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통",
  "그렇다",
  "매우 그렇다",
];

export function scaleRange(scaleType: string): { min: number; max: number } {
  switch (scaleType) {
    case "LIKERT_5":
      return { min: 1, max: 5 };
    case "SCALE_0_10":
      return { min: 0, max: 10 };
    default:
      return { min: 1, max: 7 };
  }
}

export function questionKey(q: unknown, index: number): string {
  const itemKey = (q as { itemKey?: unknown } | null | undefined)?.itemKey;
  return typeof itemKey === "string" && itemKey ? itemKey : String(index);
}

export function commentKey(itemKey: string): string {
  return `text:${itemKey}`;
}

export const MAX_TEXT_ANSWER = 5000;

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
      return (s.startsWith("/api/uploads/") || s.startsWith("/uploads/")) && !s.includes("..");
    case "text":
      return s.trim() !== "" && s.length <= MAX_TEXT_ANSWER;
    default:
      return s.trim() !== "" && s.length <= MAX_TEXT_ANSWER;
  }
}

const SCALE_TYPES = new Set(["rating", "likert5", "semantic7", "scale"]);

// 검수 보조용 불성실 응답 신호(빠른 응답·일자 응답·하위 척도 불일치·짧은 서술)
export function responseQualityFlags(
  questions: ProjectQuestion[],
  answers: Record<string, unknown>,
  durationSec?: number | null,
): string[] {
  const flags: string[] = [];
  const scale: string[] = [];
  const texts: string[] = [];
  const dims = new Map<string, number[]>();
  questions.forEach((q, i) => {
    const v = answers[questionKey(q, i)];
    if (typeof v !== "string" || v === "") return;
    if (SCALE_TYPES.has(q.type)) scale.push(v);
    else if (q.type === "text") texts.push(v.replace(/\s/g, ""));
    if (q.type === "semantic7" && q.dimension) {
      const n = Number(v);
      const k = `${q.constructId}:${q.dimension}`;
      dims.set(k, [...(dims.get(k) ?? []), q.reverse ? 8 - n : n]);
    }
  });
  const answered = scale.length + texts.length;
  if (durationSec != null && answered >= 5 && durationSec < answered * 2) {
    flags.push(`빠른 응답 의심(${answered}문항 ${durationSec}초)`);
  }
  if (scale.length >= 5 && scale.every((v) => v === scale[0])) {
    flags.push(`일자 응답 의심(척도 ${scale.length}문항 모두 ${scale[0]}점)`);
  }
  const spread = [...dims.values()].filter((vs) => vs.length >= 2 && Math.max(...vs) - Math.min(...vs) > 3).length;
  if (spread >= 3) flags.push(`하위 척도 ${spread}개에서 응답이 서로 어긋남(최고·최저 차이 4점 이상)`);
  if (texts.length > 0 && texts.every((t) => t.length < 5)) {
    flags.push(texts.length === 1 ? "서술형 답 5자 미만" : `서술형 ${texts.length}문항 모두 5자 미만`);
  }
  return flags;
}

const isEvaluatorItem = (evaluator: string | undefined) =>
  !evaluator || evaluator === "EVALUATOR";

export function blocksToProjectQuestions(
  blocks: SurveyBlock[],
  snapshot?: { id: string; evaluator?: string | null }[],
): ProjectQuestion[] {
  const evaluatorOf = new Map<string, string>();
  for (const c of snapshot ?? []) {
    if (c?.id && c.evaluator) evaluatorOf.set(c.id, c.evaluator);
  }

  const out: ProjectQuestion[] = [];

  const adaptive = blocks.filter((b) => b.kind === "LLM_ADAPTIVE");
  let firstAdaptive = true;
  for (const b of adaptive) {
    if (b.kind !== "LLM_ADAPTIVE") continue;
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

  for (const b of blocks) {
    if (b.kind !== "INSTRUMENT") continue;
    b.items.forEach((it, i) => {
      const base = {
        id: it.itemKey,
        itemKey: it.itemKey,
        constructId: b.constructId,
        section: b.constructName,
        ...(it.dimension ? { dimension: it.dimension } : {}),
        ...(it.reverse ? { reverse: true } : {}),
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

export function answersToRater(
  userId: string,
  questions: ProjectQuestion[],
  answers: Record<string, unknown>,
): { userId: string; scores: Record<string, number>; texts: Record<string, string> } {
  const scores: Record<string, number> = {};
  const texts: Record<string, string> = {};

  questions.forEach((q, i) => {
    if (!q?.itemKey) return;
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
