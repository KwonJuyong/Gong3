// 설문 응답 → 진단 리포트 채점 로직 (순수 함수).
// - LLM 적응 문항: 비네트가 있으면 앵커링 보정 점수, 없으면 raw 정규화 점수
// - UEQ: 6차원 점수(-3~+3) + 전체 점수
// - 약점 진단: 점수 오름차순 정렬 + 구성개념별 서술형 의견 수집

import { aggregateConstruct, type RaterResponse } from "./anchoring";
import { scaleRange } from "./projectQuestions";
import {
  type SurveyBlock,
  adaptiveKey,
} from "./surveyBlocks";

export type RaterRaw = {
  userId: string;
  scores: Record<string, number>; // itemKey -> 점수
  texts: Record<string, string>; // itemKey -> 서술형
};

export type ConstructReport = {
  constructId: string;
  constructName: string;
  method: "anchored" | "raw" | "instrument";
  score: number; // 0~100 비교가능 점수
  rawScore: number | null; // 보정 전 0~100 (anchored일 때만 의미)
  n: number;
  dropped: number;
  comments: string[];
};

export type UeqDimReport = { dimension: string; mean: number; n: number };

export type SurveyReport = {
  responseCount: number;
  constructs: ConstructReport[]; // 약점(낮은 점수) 우선 정렬
  ueq: UeqDimReport[] | null;
  weakest: ConstructReport[]; // 하위 3개
};

// LIKERT_5 raw(1~5) → 0~100
function likert5To100(mean: number): number {
  return ((mean - 1) / 4) * 100;
}

/**
 * UEQ 외 검증도구의 구성개념 점수 규칙. 점수는 높을수록 좋은 방향(0~100)으로 맞춤
 * 인지 부하는 설명·안내가 만든 외재 부하만 서비스 품질로 보고 방향을 뒤집음
 * (내재 부하는 학습 내용의 난이도라 서비스 탓이 아님).
 */
const INSTRUMENT_RULE: Record<string, { dims?: string[]; invert?: boolean }> = {
  CLS8: { dims: ["EXTRANEOUS"], invert: true },
};

const UEQ_DIM_LABEL: Record<string, string> = {
  ATTRACTIVENESS: "매력도",
  PERSPICUITY: "명료성",
  EFFICIENCY: "효율성",
  DEPENDABILITY: "신뢰성",
  STIMULATION: "자극",
  NOVELTY: "신규성",
};

export function scoreSurvey(blocks: SurveyBlock[], raters: RaterRaw[]): SurveyReport {
  const reports: ConstructReport[] = [];

  const vignetteByConstruct = new Map<string, { itemKey: string; level: number }[]>();
  for (const b of blocks) {
    if (b.kind === "VIGNETTE") {
      vignetteByConstruct.set(
        b.constructId,
        [...b.items].sort((a, c) => a.level - c.level),
      );
    }
  }

  for (const b of blocks) {
    if (b.kind !== "LLM_ADAPTIVE") continue;

    const vigs = vignetteByConstruct.get(b.constructId);
    const comments: string[] = [];
    for (const r of raters) {
      const t = (r.texts[b.itemKey] || "").trim();
      if (t) comments.push(t);
    }

    if (vigs && vigs.length >= 2) {
      // 앵커링 보정
      const rr: RaterResponse[] = [];
      let rawSum = 0;
      let rawN = 0;
      for (const r of raters) {
        const y = r.scores[adaptiveKey(b.constructId)];
        const z = vigs.map((v) => r.scores[v.itemKey]);
        if (typeof y !== "number" || z.some((v) => typeof v !== "number")) continue;
        rr.push({ raterId: r.userId, y, z });
        rawSum += y;
        rawN++;
      }
      const agg = aggregateConstruct(rr);
      reports.push({
        constructId: b.constructId,
        constructName: b.constructName,
        method: "anchored",
        score: agg.correctedMean,
        rawScore: rawN > 0 ? likert5To100(rawSum / rawN) : null,
        n: agg.n,
        dropped: agg.dropped,
        comments,
      });
    } else {
      // raw 정규화
      let sum = 0;
      let n = 0;
      for (const r of raters) {
        const y = r.scores[adaptiveKey(b.constructId)];
        if (typeof y === "number") {
          sum += y;
          n++;
        }
      }
      reports.push({
        constructId: b.constructId,
        constructName: b.constructName,
        method: "raw",
        score: n > 0 ? likert5To100(sum / n) : 0,
        rawScore: null,
        n,
        dropped: 0,
        comments,
      });
    }
  }

  // UEQ
  let ueq: UeqDimReport[] | null = null;
  const ueqBlock = blocks.find((b) => b.kind === "INSTRUMENT" && b.instrument === "UEQ");
  if (ueqBlock && ueqBlock.kind === "INSTRUMENT") {
    const dimAcc = new Map<string, { sum: number; n: number }>();
    for (const it of ueqBlock.items) {
      const dim = it.dimension || "OTHER";
      for (const r of raters) {
        const raw = r.scores[it.itemKey];
        if (typeof raw !== "number") continue;
        const val = it.reverse ? 8 - raw : raw; // 역문항 반전
        const centered = val - 4; // 1~7 → -3~+3
        const cur = dimAcc.get(dim) || { sum: 0, n: 0 };
        cur.sum += centered;
        cur.n++;
        dimAcc.set(dim, cur);
      }
    }
    ueq = [...dimAcc.entries()].map(([dimension, v]) => ({
      dimension: UEQ_DIM_LABEL[dimension] || dimension,
      mean: v.n > 0 ? v.sum / v.n : 0,
      n: v.n,
    }));

    // UEQ 전체를 구성개념 리포트에도 반영(0~100 환산: (-3~3) → 0~100)
    const allMean =
      ueq.length > 0 ? ueq.reduce((a, d) => a + d.mean, 0) / ueq.length : 0;
    reports.push({
      constructId: ueqBlock.constructId,
      constructName: ueqBlock.constructName,
      method: "instrument",
      score: ((allMean + 3) / 6) * 100,
      rawScore: null,
      n: raters.length,
      dropped: 0,
      comments: [],
    });
  }

  // UEQ 외 검증도구: 역문항을 반전해 문항 평균을 0~100 으로 환산
  for (const b of blocks) {
    if (b.kind !== "INSTRUMENT" || b.instrument === "UEQ") continue;
    const { min, max } = scaleRange(b.scaleType);
    const rule = INSTRUMENT_RULE[b.instrument] ?? {};
    const items = rule.dims ? b.items.filter((it) => rule.dims!.includes(it.dimension || "")) : b.items;
    let sum = 0;
    let count = 0;
    const respondents = new Set<string>();
    for (const it of items) {
      for (const r of raters) {
        const raw = r.scores[it.itemKey];
        if (typeof raw !== "number") continue;
        sum += it.reverse ? min + max - raw : raw;
        count++;
        respondents.add(r.userId);
      }
    }
    if (count === 0) continue;
    const pct = ((sum / count - min) / (max - min)) * 100;
    reports.push({
      constructId: b.constructId,
      constructName: b.constructName,
      method: "instrument",
      score: rule.invert ? 100 - pct : pct,
      rawScore: null,
      n: respondents.size,
      dropped: 0,
      comments: [],
    });
  }

  const sorted = [...reports].sort((a, b) => a.score - b.score);
  return {
    responseCount: raters.length,
    constructs: sorted,
    ueq,
    weakest: sorted.slice(0, 3),
  };
}
