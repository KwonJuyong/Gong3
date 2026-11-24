// 응답 검증·검수 보조 표시·UEQ 리포트 회귀 검사(DB 불필요). 실행: npm run test:response
import assert from "node:assert/strict";
import { test } from "node:test";
import { blocksToProjectQuestions, responseQualityFlags } from "../app/lib/projectQuestions.ts";
import { cronbachAlpha, meanCi, scoreSurvey, ueqBenchmark } from "../app/lib/surveyScore.ts";

const DIMS = ["ATTRACTIVENESS", "PERSPICUITY", "EFFICIENCY", "DEPENDABILITY"];

// 하위 척도마다 정방향 1문항·역문항 1문항
const blocks = [
  {
    kind: "INSTRUMENT",
    instrument: "UEQ",
    constructId: "ux",
    constructName: "사용자 경험",
    scaleType: "SEMANTIC_7",
    items: DIMS.flatMap((dimension, d) => [
      { itemKey: `UEQ:${d * 2 + 1}`, ordinal: d * 2 + 1, text: "", leftLabel: "나쁨", rightLabel: "좋음", dimension, reverse: false },
      { itemKey: `UEQ:${d * 2 + 2}`, ordinal: d * 2 + 2, text: "", leftLabel: "좋음", rightLabel: "나쁨", dimension, reverse: true },
    ]),
  },
];
const questions = blocksToProjectQuestions(blocks);
const answer = (pairs) => Object.fromEntries(pairs.flatMap(([a, b], d) => [[`UEQ:${d * 2 + 1}`, String(a)], [`UEQ:${d * 2 + 2}`, String(b)]]));
const mismatch = (flags) => flags.some((f) => f.includes("하위 척도"));

test("검증도구 문항에 하위 척도와 역문항 표시", () => {
  assert.equal(questions[0].dimension, "ATTRACTIVENESS");
  assert.equal(questions[0].reverse, undefined);
  assert.equal(questions[1].reverse, true);
});

test("역문항을 반대 방향으로 고른 성실 응답은 표시 없음", () => {
  // 정방향 7점, 역문항 1점은 둘 다 가장 긍정
  assert.equal(mismatch(responseQualityFlags(questions, answer([[7, 1], [6, 2], [7, 1], [5, 3]]))), false);
});

test("역문항과 같은 쪽을 고른 척도가 3개 이상이면 표시", () => {
  const flags = responseQualityFlags(questions, answer([[7, 7], [7, 7], [6, 7], [5, 3]]));
  assert.ok(mismatch(flags));
  assert.ok(flags.some((f) => f.includes("일자 응답")) === false);
});

test("어긋난 척도가 2개면 표시 없음", () => {
  assert.equal(mismatch(responseQualityFlags(questions, answer([[7, 7], [7, 7], [6, 2], [5, 3]]))), false);
});

test("하위 척도 정보가 없는 기존 평가 문항은 판정 제외", () => {
  const legacy = questions.map(({ dimension: _d, reverse: _r, ...q }) => q);
  assert.equal(mismatch(responseQualityFlags(legacy, answer([[7, 7], [7, 7], [7, 7], [7, 7]]))), false);
});

test("응답 문항당 2초 미만이면 빠른 응답 표시", () => {
  const ok = answer([[7, 1], [6, 2], [7, 1], [5, 3]]);
  const fast = (flags) => flags.some((f) => f.includes("빠른 응답"));
  assert.ok(fast(responseQualityFlags(questions, ok, 15)));
  assert.equal(fast(responseQualityFlags(questions, ok, 16)), false);
  assert.equal(fast(responseQualityFlags(questions, ok, null)), false);
});

test("신뢰구간은 응답자 수에 맞는 t 분위수 사용", () => {
  const { mean, ci } = meanCi([1, 2, 3]);
  assert.equal(mean, 2);
  assert.ok(Math.abs(ci - 4.303 / Math.sqrt(3)) < 1e-9);
  assert.equal(meanCi([1]).ci, null);
});

test("응답이 없는 항목은 약점 순위에서 빼고 맨 뒤에 둠", () => {
  const adaptive = [
    { kind: "LLM_ADAPTIVE", constructId: "a", constructName: "답함", itemKey: "LLM:a" },
    { kind: "LLM_ADAPTIVE", constructId: "b", constructName: "안 답함", itemKey: "LLM:b" },
  ];
  const report = scoreSurvey(adaptive, [{ userId: "u1", scores: { "adaptive:a": 4 }, texts: {} }]);
  assert.deepEqual(report.weakest.map((c) => c.constructId), ["a"]);
  assert.equal(report.constructs.at(-1).constructId, "b");
});

test("Cronbach α 계산과 계산 불가 조건", () => {
  assert.equal(cronbachAlpha([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]), 1);
  assert.ok(Math.abs(cronbachAlpha([[1, 2], [2, 1], [3, 4], [4, 3]]) - 0.75) < 1e-9);
  assert.equal(cronbachAlpha([[1, 3], [2, 2], [3, 1]]), null);
  assert.equal(cronbachAlpha([[1], [2], [3]]), null);
});

test("UEQ 벤치마크 범주 경계", () => {
  assert.equal(ueqBenchmark("ATTRACTIVENESS", 1.84), "상위 10%");
  assert.equal(ueqBenchmark("ATTRACTIVENESS", 1.83), "상위 10~25%");
  assert.equal(ueqBenchmark("NOVELTY", 0.16), "하위 25~50%");
  assert.equal(ueqBenchmark("NOVELTY", 0.15), "하위 25%");
  assert.equal(ueqBenchmark("OTHER", 3), null);
});

test("UEQ 리포트는 응답자 단위로 평균·인원·구간 계산", () => {
  const ueqBlocks = [{ ...blocks[0], instrument: "UEQ" }];
  // 매력도: 응답자 a 는 +3(7, 역문항 1), b 는 +1(5, 역문항 3)
  const raters = [
    { userId: "a", scores: { "UEQ:1": 7, "UEQ:2": 1 }, texts: {} },
    { userId: "b", scores: { "UEQ:1": 5, "UEQ:2": 3 }, texts: {} },
  ];
  const report = scoreSurvey(ueqBlocks, raters);
  assert.equal(report.ueq.length, 1);
  const [d] = report.ueq;
  assert.equal(d.n, 2);
  assert.equal(d.mean, 2);
  assert.ok(d.ci > 0);
  assert.equal(d.benchmark, "상위 10%");
});
