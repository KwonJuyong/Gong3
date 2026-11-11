import "server-only";

// 뉴스 수집. 저작권 때문에 기사 본문은 저장하지 않고 제목·링크·출처만 받음

export type NewsItem = {
  source: "gdelt" | "hn" | "msit";
  externalId: string;
  url: string;
  title: string;
  category: string | null; // 출처 도메인(화면 표시용)
  publishedAt: Date;
};

// 상업적 재배포 허용. 5초에 1회 제한이 있고, 넘기면 429 와 함께 안내 텍스트를 줌

const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_QUERY = '("artificial intelligence" OR "machine learning") sourcelang:eng';

type GdeltArticle = {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
};

/** GDELT의 seendate는 "20260715T161500Z" 형식이라 Date가 그대로 못 읽음 */
function parseSeenDate(s: string | undefined): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GDELT 호출 재시도. 두 경우 모두 재시도함
 * - 429: 호출 빈도 제한
 * - 연결 타임아웃(UND_ERR_CONNECT_TIMEOUT): undici 기본 연결 제한 10초보다 느린 경우. 예외로 던져짐
 */
async function fetchGdeltWithRetry(url: string, attempts = 4): Promise<Response> {
  let lastError = "";
  for (let i = 0; i < attempts; i++) {
    // 15초 간격 4회(약 100초). 정각 무렵의 혼잡을 넘기려면 이 정도가 필요했음
    if (i > 0) await sleep(15000);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429) {
        lastError = "레이트리밋(5초에 1회)";
        continue;
      }
      return res;
    } catch (e) {
      // 연결 실패는 다음 시도로 넘김
      lastError = e instanceof Error ? (e.cause as Error | undefined)?.message || e.message : String(e);
    }
  }
  throw new Error(`GDELT 호출이 ${attempts}회 모두 실패했습니다: ${lastError}`);
}

/** 응답 본문 → 항목. 네트워크 없이 파싱만 검증할 수 있게 분리했음 */
export function parseGdeltArticles(text: string): NewsItem[] {
  let parsed: { articles?: GdeltArticle[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    // 레이트리밋이면 JSON이 아니라 안내문이 옴
    throw new Error(`GDELT가 JSON이 아닌 응답을 보냈습니다: ${text.slice(0, 120)}`);
  }

  const items: NewsItem[] = [];
  for (const a of parsed.articles ?? []) {
    const publishedAt = parseSeenDate(a.seendate);
    if (!a.url || !a.title || !publishedAt) continue;
    items.push({
      source: "gdelt",
      // GDELT는 안정적인 항목 id를 주지 않음. URL이 사실상의 고유키임
      externalId: a.url,
      url: a.url,
      title: a.title.trim(),
      category: a.domain ?? null,
      publishedAt,
    });
  }
  return items;
}

export async function fetchGdeltNews(limit = 25): Promise<NewsItem[]> {
  const url =
    `${GDELT_ENDPOINT}?query=${encodeURIComponent(GDELT_QUERY)}` +
    `&mode=ArtList&maxrecords=${limit}&format=json&timespan=3d`;

  const res = await fetchGdeltWithRetry(url);
  if (!res.ok) throw new Error(`GDELT 응답 오류: HTTP ${res.status}`);

  return parseGdeltArticles(await res.text());
}

// 화제성 보조 지표. 상업 이용 약관이 명시돼 있지 않아 비중을 작게 둠
// Algolia 는 접두어로 매칭하고(AI → Airfoil) 관련도순으로 정렬하므로,
// 기간을 잘라 받고 제목을 정규식으로 한 번 더 거름

const HN_ENDPOINT = "https://hn.algolia.com/api/v1/search";
const HN_MIN_POINTS = 50;
const HN_WINDOW_DAYS = 7;

/** 제목이 실제로 AI 얘기인지. 접두어 오매칭("Airfoil")을 여기서 쳐냄 */
const HN_TOPIC = /\bAI\b|\bAGI\b|\bLLMs?\b|artificial intelligence|machine learning|neural|GPT|Claude|Gemini|OpenAI|Anthropic/i;

type HnHit = {
  objectID?: string;
  title?: string;
  url?: string | null;
  created_at?: string;
};

export async function fetchHnNews(limit = 15): Promise<NewsItem[]> {
  const cutoff = Math.floor(Date.now() / 1000) - HN_WINDOW_DAYS * 86400;
  // 걸러낼 것을 감안해 넉넉히 받아 온 뒤 limit까지만 씀
  const url =
    `${HN_ENDPOINT}?query=AI&tags=story&hitsPerPage=50` +
    `&numericFilters=${encodeURIComponent(`points>${HN_MIN_POINTS},created_at_i>${cutoff}`)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HN 응답 오류: HTTP ${res.status}`);

  const parsed = (await res.json()) as { hits?: HnHit[] };

  const items: NewsItem[] = [];
  for (const h of parsed.hits ?? []) {
    if (!h.objectID || !h.title) continue;
    if (!HN_TOPIC.test(h.title)) continue;
    const publishedAt = new Date(h.created_at ?? "");
    if (Number.isNaN(publishedAt.getTime())) continue;

    // 외부 링크가 없는 글(Ask HN 등)은 HN 스레드로 연결함
    const target = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
    items.push({
      source: "hn",
      externalId: h.objectID,
      url: target,
      title: h.title.trim(),
      category: (() => {
        try {
          return new URL(target).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      })(),
      publishedAt,
    });
    if (items.length >= limit) break;
  }
  return items;
}
