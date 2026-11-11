import "server-only";
import { XMLParser } from "fast-xml-parser";

// arXiv 논문 수집. 메타데이터는 CC0 이지만 본문 재호스팅은 허용되지 않아 제목·초록·링크만 받음
// http 로 호출하면 빈 응답이 오므로 https 를 씀

const ENDPOINT = "https://export.arxiv.org/api/query";

// AI 평가단이 볼 만한 분류. 넓히면 노이즈가 급증하므로 3개로 묶어 둠
const CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"];

// arXiv 는 연락 가능한 User-Agent 를 요구함
const USER_AGENT = "evalia.co.kr AI-insights/1.0 (mailto:labchain.hallym@gmail.com)";

export type ArxivPaper = {
  externalId: string; // "2607.15275v1"
  url: string;
  title: string;
  abstract: string;
  authors: string[];
  category: string | null;
  publishedAt: Date;
};

/** 단일 값 또는 배열로 오는 Atom 필드를 배열로 정규화 */
function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function clean(s: unknown): string {
  // Atom의 title·summary는 줄바꿈이 그대로 들어옴
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

type AtomEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | { name?: string }[];
  "arxiv:primary_category"?: { "@_term"?: string };
  category?: { "@_term"?: string } | { "@_term"?: string }[];
};

export async function fetchArxivPapers(limit = 25): Promise<ArxivPaper[]> {
  const query = CATEGORIES.map((c) => `cat:${c}`).join(" OR ");
  const url =
    `${ENDPOINT}?search_query=${encodeURIComponent(query)}` +
    `&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`arXiv 응답 오류: HTTP ${res.status}`);

  const xml = await res.text();
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  }).parse(xml) as { feed?: { entry?: AtomEntry | AtomEntry[] } };

  const entries = asArray(parsed.feed?.entry);
  if (entries.length === 0) throw new Error("arXiv 응답에 논문이 없습니다.");

  const papers: ArxivPaper[] = [];
  for (const e of entries) {
    // id 는 "http://arxiv.org/abs/2607.15275v1" 형태이고 마지막 조각이 버전 포함 id 다
    const externalId = String(e.id ?? "").split("/abs/")[1];
    const title = clean(e.title);
    const published = new Date(String(e.published ?? ""));
    if (!externalId || !title || Number.isNaN(published.getTime())) continue;

    papers.push({
      externalId,
      // id의 http를 그대로 쓰지 않고 https 정규 URL로 내보냄
      url: `https://arxiv.org/abs/${externalId}`,
      title,
      abstract: clean(e.summary),
      authors: asArray(e.author)
        .map((a) => clean(a?.name))
        .filter(Boolean),
      category:
        e["arxiv:primary_category"]?.["@_term"] ??
        asArray(e.category)[0]?.["@_term"] ??
        null,
      publishedAt: published,
    });
  }
  return papers;
}
