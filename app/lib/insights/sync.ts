import "server-only";
import { prisma } from "@/app/db";
import { fetchArxivPapers } from "./arxiv";
import { fetchEpochScores } from "./epoch";
import { fetchGdeltNews, fetchHnNews, type NewsItem } from "./news";
import { fetchMsitNews } from "./msit";
import { fetchOpenrouterUsage, USAGE_METRIC } from "./openrouter";
import { summarizeItems } from "./summarize";

// AI News 수집. 화면은 DB 만 읽고 외부 API 는 여기서만 호출한다.
// 소스별로 독립적으로 실행하고 결과는 InsightSync 에 남긴다.

export type SourceResult = {
  source: string;
  ok: boolean;
  itemCount: number;
  error?: string;
};

/** 소스 하나를 실행하고 성패를 InsightSync에 기록한다. 예외를 밖으로 던지지 않는다. */
async function runSource(
  source: string,
  fn: () => Promise<number>,
): Promise<SourceResult> {
  const startedAt = new Date();
  try {
    const itemCount = await fn();
    await prisma.insightSync.create({
      data: { source, ok: true, itemCount, startedAt, finishedAt: new Date() },
    });
    return { source, ok: true, itemCount };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[insights] ${source} 수집 실패:`, e);
    await prisma.insightSync.create({
      // HTML 응답 등으로 길어질 수 있어 잘라서 저장한다
      data: { source, ok: false, error: error.slice(0, 500), startedAt, finishedAt: new Date() },
    });
    return { source, ok: false, itemCount: 0, error };
  }
}

/** arXiv: 새로 들어온 논문만 요약해 저장한다. 반환값은 '새로 추가된' 건수. */
async function syncArxiv(): Promise<number> {
  const papers = await fetchArxivPapers(25);

  // 이미 저장된 항목은 다시 요약하지 않는다.
  const existing = await prisma.insightItem.findMany({
    where: { source: "arxiv", externalId: { in: papers.map((p) => p.externalId) } },
    select: { externalId: true },
  });
  const known = new Set(existing.map((e) => e.externalId));
  const fresh = papers.filter((p) => !known.has(p.externalId));
  if (fresh.length === 0) return 0;

  // 요약이 실패해도 항목은 제목+링크로 노출돼야 하므로 summaryKo는 비워 둔 채 저장한다.
  const summaries = await summarizeItems(
    fresh.map((p) => ({ id: p.externalId, title: p.title, abstract: p.abstract })),
  );

  const created = await prisma.insightItem.createMany({
    data: fresh.map((p) => ({
      kind: "PAPER" as const,
      source: "arxiv",
      externalId: p.externalId,
      url: p.url,
      title: p.title,
      abstract: p.abstract,
      summaryKo: summaries.get(p.externalId) ?? null,
      authors: p.authors,
      category: p.category,
      publishedAt: p.publishedAt,
    })),
    // 동시에 두 번 돌아도 unique 충돌로 전체가 실패하지 않게 한다
    skipDuplicates: true,
  });
  return created.count;
}

/** Epoch: 지표별 스냅샷을 통째로 교체한다. */
async function syncEpoch(): Promise<number> {
  const scores = await fetchEpochScores();
  const asOf = new Date();
  const metrics = [...new Set(scores.map((s) => s.metric))];

  // 상위 N 에서 밀려난 모델이 남지 않도록 통째로 교체한다.
  await prisma.$transaction([
    prisma.modelScore.deleteMany({ where: { source: "epoch", metric: { in: metrics } } }),
    prisma.modelScore.createMany({
      data: scores.map((s) => ({
        source: "epoch",
        metric: s.metric,
        modelKey: s.modelKey,
        displayName: s.displayName,
        organization: s.organization,
        score: s.score,
        rank: s.rank,
        // Epoch 배포물에는 기준일이 없어 받은 시각을 쓴다.
        asOf,
        releasedAt: s.releasedAt,
      })),
    }),
  ]);
  return scores.length;
}

/** 뉴스 저장. 본문이 없어 요약은 만들지 않고 제목과 링크만 저장한다. */
async function saveNews(items: NewsItem[], source: string): Promise<number> {
  if (items.length === 0) return 0;

  const existing = await prisma.insightItem.findMany({
    where: { source, externalId: { in: items.map((i) => i.externalId) } },
    select: { externalId: true },
  });
  const known = new Set(existing.map((e) => e.externalId));
  const fresh = items.filter((i) => !known.has(i.externalId));
  if (fresh.length === 0) return 0;

  const created = await prisma.insightItem.createMany({
    data: fresh.map((i) => ({
      kind: "NEWS" as const,
      source: i.source,
      externalId: i.externalId,
      url: i.url,
      title: i.title,
      abstract: null, // 본문·초록은 저장하지 않는다
      summaryKo: null,
      authors: [],
      category: i.category,
      publishedAt: i.publishedAt,
    })),
    skipDuplicates: true,
  });
  return created.count;
}

/** OpenRouter: 실사용 순위도 통째로 교체한다. */
async function syncOpenrouter(): Promise<number> {
  const scores = await fetchOpenrouterUsage();

  await prisma.$transaction([
    prisma.modelScore.deleteMany({
      where: { source: "openrouter", metric: USAGE_METRIC },
    }),
    prisma.modelScore.createMany({
      data: scores.map((s) => ({
        source: "openrouter",
        metric: USAGE_METRIC,
        modelKey: s.modelKey,
        displayName: s.displayName,
        organization: s.organization,
        score: s.totalTokens,
        rank: s.rank,
        // 응답에 있는 기준일을 출처 표기에 쓴다.
        asOf: s.asOf,
        releasedAt: null,
      })),
    }),
  ]);
  return scores.length;
}

const SOURCES: Record<string, () => Promise<number>> = {
  arxiv: syncArxiv,
  epoch: syncEpoch,
  openrouter: syncOpenrouter,
  gdelt: async () => saveNews(await fetchGdeltNews(25), "gdelt"),
  hn: async () => saveNews(await fetchHnNews(15), "hn"),
  // AI 관련만 걸러내므로 넉넉히 받는다
  msit: async () => saveNews(await fetchMsitNews(100), "msit"),
};

/**
 * 수집 실행. only 를 주면 그 소스만 돌린다.
 * 외부 호출 제한을 고려해 소스는 순차로 실행한다.
 */
export async function syncInsights(only?: string[]): Promise<SourceResult[]> {
  const names = only?.length
    ? only.filter((n) => n in SOURCES)
    : Object.keys(SOURCES);

  const results: SourceResult[] = [];
  for (const name of names) {
    results.push(await runSource(name, SOURCES[name]));
  }
  return results;
}
