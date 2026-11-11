import "server-only";

// OpenRouter 실사용 순위(토큰 사용량 기준). 성능 순위(Epoch)와는 다른 지표라 따로 보여줌

const ENDPOINT = "https://openrouter.ai/api/v1/datasets/rankings-daily";

/** 출처 표기 문구. 화면에 반드시 노출함(as_of 포함이 요건). */
export function openrouterCitation(asOf: Date): string {
  return `Source: OpenRouter (openrouter.ai/rankings), as of ${asOf.toISOString().slice(0, 10)}`;
}

const TOP_N = 15;

/** 수집과 화면이 같은 문자열을 봐야 하므로 한 곳에서만 정의함 */
export const USAGE_METRIC = "usage_tokens";

export type UsageScore = {
  modelKey: string;
  displayName: string;
  organization: string | null;
  totalTokens: number;
  rank: number;
  asOf: Date;
};

type RankingRow = {
  date?: string;
  model_permaslug?: string;
  total_tokens?: string;
};

/**
 * 슬러그에서 표시명을 만듦. `deepseek/deepseek-v4-flash-20260423` →
 * 조직 `deepseek`, 표시명 `deepseek-v4-flash`.
 * 끝의 `-YYYYMMDD`는 버전 날짜라 화면에서 잘라냄(modelKey에는 그대로 남음).
 */
function splitSlug(slug: string): { displayName: string; organization: string | null } {
  const slash = slug.indexOf("/");
  const organization = slash > 0 ? slug.slice(0, slash) : null;
  const rest = slash > 0 ? slug.slice(slash + 1) : slug;
  return { displayName: rest.replace(/-\d{8}(?=$|:)/, ""), organization };
}

export async function fetchOpenrouterUsage(): Promise<UsageScore[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY 가 설정되지 않았습니다.");

  const res = await fetch(ENDPOINT, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenRouter 응답 오류: HTTP ${res.status}`);

  const rows: RankingRow[] = (await res.json())?.data ?? [];
  if (rows.length === 0) throw new Error("OpenRouter 응답이 비어 있습니다.");

  // 30일치가 한 번에 오므로 최신일만 씀
  const latest = rows.reduce((max, r) => (r.date && r.date > max ? r.date : max), "");
  const asOf = new Date(`${latest}T00:00:00Z`);
  if (Number.isNaN(asOf.getTime())) throw new Error(`OpenRouter 날짜 파싱 실패: ${latest}`);

  return rows
    .filter((r) => r.date === latest)
    .map((r) => {
      const modelKey = r.model_permaslug;
      const totalTokens = Number(r.total_tokens);
      if (!modelKey || !Number.isFinite(totalTokens)) return null;
      // 'other' 는 나머지 모델의 합계 행이라 순위에서 뺌
      if (!modelKey.includes("/")) return null;
      return { modelKey, totalTokens, ...splitSlug(modelKey) };
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, TOP_N)
    .map((r, i) => ({ ...r, rank: i + 1, asOf }));
}
