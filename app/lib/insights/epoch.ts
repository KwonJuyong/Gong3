import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { parseCsv } from "./csv";

// Epoch AI 벤치마크 수집. CC-BY 라서 화면에 EPOCH_CITATION 을 표시해야 함
// 배포물은 ZIP 하나이고 안에 벤치마크별 CSV 가 있음

const ZIP_URL = "https://epoch.ai/data/benchmark_data.zip";

/** CC-BY 표기 문구. 화면에서 반드시 노출함 */
export const EPOCH_CITATION =
  "Epoch AI, 'AI Benchmarking Hub'. Published online at epoch.ai.";

/**
 * 쓰는 지표 2개.
 * - eci: Epoch Capabilities Index. 종합 역량 지수이고 순위의 기본값임
 * - swe_bench_verified: 실제 코드 수정 과제 성공률. 종합 지수와 성격이 달라 같이 봄
 *
 * ZIP 안 파일명이 곧 metric 키임. 늘릴 땐 여기만 추가하면 됨
 */
const METRICS = [
  { metric: "eci", file: "epoch_capabilities_index.csv", scoreColumn: "ECI Score" },
  { metric: "swe_bench_verified", file: "swe_bench_verified.csv", scoreColumn: "mean_score" },
] as const;

// 스냅샷만 유지하므로 상위 N개만 담음. 720행 전부는 화면에 쓸 일이 없음
const TOP_N = 30;

export type EpochScore = {
  metric: string;
  modelKey: string;
  displayName: string;
  organization: string | null;
  score: number;
  rank: number;
  releasedAt: Date | null;
};

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  // "YYYY-MM-DD" 를 UTC 로 읽어야 로컬 타임존 때문에 날짜가 밀리지 않음
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchEpochScores(): Promise<EpochScore[]> {
  const res = await fetch(ZIP_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Epoch 응답 오류: HTTP ${res.status}`);

  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const out: EpochScore[] = [];

  for (const { metric, file, scoreColumn } of METRICS) {
    const raw = files[file];
    if (!raw) throw new Error(`Epoch ZIP에 ${file}이 없습니다.`);

    // 지표 하나 안에서 modelKey는 유일해야 함(DB unique: source+metric+modelKey).
    const seen = new Set<string>();

    const rows = parseCsv(strFromU8(raw))
      .map((r) => {
        const modelKey = r["Model version"];
        const score = Number(r[scoreColumn]);
        // 점수가 빈 행이 실제로 있음(미측정 모델). Number("")는 0이라 조용히 섞이므로 명시적으로 거름
        if (!modelKey || !r[scoreColumn] || Number.isNaN(score)) return null;
        return {
          metric,
          modelKey,
          // 표시명이 비어 있는 행이 있어 모델명 → 내부 키 순으로 대체함
          displayName: r["Display name"] || r["Model name"] || modelKey,
          organization: r["Organization"] || null,
          score,
          releasedAt: parseDate(r["Release date"]),
        };
      })
      .filter((r) => r !== null)
      .sort((a, b) => b.score - a.score)
      // 모델 단위 CSV가 아닌 것이 섞여 있음. swe_bench_verified.csv는 실행(run) 단위라
      // 같은 모델이 실행 횟수만큼 나옴(claude-opus-4-6이 0.787/0.756 두 행). 안 거르면
      // unique 제약에 걸려 그 지표 전체가 저장에 실패함. ECI는 모델 단위라 증상이 없었음
      // 점수 내림차순이므로 먼저 만나는 행이 그 모델의 최고 점수임: 그걸 대표로 씀
      .filter((r) => {
        if (seen.has(r.modelKey)) return false;
        seen.add(r.modelKey);
        return true;
      })
      .slice(0, TOP_N)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    if (rows.length === 0) throw new Error(`${file}에서 유효한 점수를 찾지 못했습니다.`);
    out.push(...rows);
  }

  return out;
}
