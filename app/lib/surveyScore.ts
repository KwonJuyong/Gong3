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

export type UeqDimReport = {
  dimension: string;
  mean: number;
  /** 응답자 수 */
  n: number;
  /** 평균의 95% 신뢰구간 반폭. 응답자 2명 미만이면 null */
  ci: number | null;
  /** UEQ 일반 벤치마크 대비 범주. 기준이 없는 차원이면 null */
  benchmark: string | null;
  /** 척도 내적 일관성(Cronbach α). 모든 문항에 답한 응답자가 ALPHA_MIN_N 명 미만이면 null */
  alpha: number | null;
};

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

/**
 * UEQ 일반 벤치마크(제품 평가 468건) 범주 하한. 순서: 최상위 10%, 상위 10~25%, 상위 25~50%, 하위 25~50%
 * 출처: Schrepp, UEQ Handbook v11(2023) 「General Benchmark」 표
 */
const UEQ_BENCHMARK: Record<string, [number, number, number, number]> = {
  ATTRACTIVENESS: [1.84, 1.58, 1.18, 0.69],
  PERSPICUITY: [2.0, 1.73, 1.2, 0.72],
  EFFICIENCY: [1.88, 1.5, 1.05, 0.6],
  DEPENDABILITY: [1.7, 1.48, 1.14, 0.78],
  STIMULATION: [1.7, 1.35, 1.0, 0.5],
  NOVELTY: [1.6, 1.12, 0.7, 0.16],
};
const BENCHMARK_LABEL = ["상위 10%", "상위 10~25%", "상위 25~50%", "하위 25~50%", "하위 25%"];

export function ueqBenchmark(dimension: string, mean: number): string | null {
  const borders = UEQ_BENCHMARK[dimension];
  if (!borders) return null;
  const idx = borders.findIndex((b) => mean >= b);
  return BENCHMARK_LABEL[idx === -1 ? 4 : idx];
}

// t 분포 0.975 분위수(자유도 1~30). 표본이 작은 평가단 규모라 정규 근사 대신 사용
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];

/** 응답자별 값의 평균과 95% 신뢰구간 반폭 */
export function meanCi(values: number[]): { mean: number; ci: number | null } {
  const n = values.length;
  const mean = n > 0 ? values.reduce((a, v) => a + v, 0) / n : 0;
  if (n < 2) return { mean, ci: null };
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const t = n - 1 <= 30 ? T975[n - 2] : n - 1 <= 60 ? 2.0 : n - 1 <= 120 ? 1.98 : 1.96;
  return { mean, ci: (t * sd) / Math.sqrt(n) };
}

// UEQ 핸드북: 20~40명 표본의 낮은 α 는 표본 효과일 수 있어 무시 권장. 그보다 적으면 표시하지 않음
export const ALPHA_MIN_N = 20;

/** 응답자 × 문항 점수 행렬의 Cronbach α. 문항 2개 미만이거나 총점 분산이 0이면 null */
export function cronbachAlpha(rows: number[][]): number | null {
  const k = rows[0]?.length ?? 0;
  if (k < 2 || rows.length < 2) return null;
  const variance = (xs: number[]) => {
    const m = xs.reduce((a, v) => a + v, 0) / xs.length;
    return xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1);
  };
  const itemVar = Array.from({ length: k }, (_, j) => variance(rows.map((r) => r[j]))).reduce((a, v) => a + v, 0);
  const totalVar = variance(rows.map((r) => r.reduce((a, v) => a + v, 0)));
  return totalVar === 0 ? null : (k / (k - 1)) * (1 - itemVar / totalVar);
}

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
    // 차원별·응답자별 합계. 신뢰구간은 응답자 단위 척도 평균으로 계산함(UEQ 핸드북 방식)
    const dimAcc = new Map<string, Map<string, { sum: number; n: number }>>();
    for (const it of ueqBlock.items) {
      const dim = it.dimension || "OTHER";
      const byRater = dimAcc.get(dim) ?? new Map<string, { sum: number; n: number }>();
      dimAcc.set(dim, byRater);
      for (const r of raters) {
        const raw = r.scores[it.itemKey];
        if (typeof raw !== "number") continue;
        const val = it.reverse ? 8 - raw : raw; // 역문항 반전
        const cur = byRater.get(r.userId) || { sum: 0, n: 0 };
        cur.sum += val - 4; // 1~7 → -3~+3
        cur.n++;
        byRater.set(r.userId, cur);
      }
    }
    ueq = [...dimAcc.entries()]
      .filter(([, byRater]) => byRater.size > 0)
      .map(([dimension, byRater]) => {
        const { mean, ci } = meanCi([...byRater.values()].map((v) => v.sum / v.n));
        // 차원 문항에 모두 답한 응답자만 α 계산에 씀(역문항 반전 후)
        const dimItems = ueqBlock.items.filter((it) => (it.dimension || "OTHER") === dimension);
        const rows = raters
          .map((r) => dimItems.map((it) => r.scores[it.itemKey]))
          .filter((row): row is number[] => row.every((v) => typeof v === "number"))
          .map((row) => row.map((v, j) => (dimItems[j].reverse ? 8 - v : v)));
        return {
          dimension: UEQ_DIM_LABEL[dimension] || dimension,
          mean,
          n: byRater.size,
          ci,
          benchmark: ueqBenchmark(dimension, mean),
          alpha: rows.length >= ALPHA_MIN_N ? cronbachAlpha(rows) : null,
        };
      });

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

  // 응답이 없는 항목은 0점이 아니라 미측정이라 약점 순위에서 빼고 맨 뒤에 둠
  const measured = reports.filter((r) => r.n > 0).sort((a, b) => a.score - b.score);
  return {
    responseCount: raters.length,
    constructs: [...measured, ...reports.filter((r) => r.n === 0)],
    ueq,
    weakest: measured.slice(0, 3),
  };
}
