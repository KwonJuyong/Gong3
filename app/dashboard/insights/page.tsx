import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { prisma } from "../../db";
import { EPOCH_CITATION } from "../../lib/insights/epoch";
import { openrouterCitation, USAGE_METRIC } from "../../lib/insights/openrouter";
import { MSIT_CITATION } from "../../lib/insights/msit";
import StockTicker from "./StockTicker";

export const metadata = { title: "AI News" };
export const dynamic = "force-dynamic";

const PREVIEW = 5;
const RANK_LIMIT = 15;

const SOURCE_LABEL: Record<string, string> = {
  hn: "Hacker News",
  gdelt: "GDELT",
  msit: "과학기술정보통신부",
};

const shortDate = (d: Date) =>
  d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });

const longDate = (d: Date) =>
  d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" });

function formatTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  return n.toLocaleString("ko-KR");
}

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

function modelScores(source: string, metric: string) {
  return prisma.modelScore.findMany({ where: { source, metric }, orderBy: { rank: "asc" }, take: RANK_LIMIT });
}

export default async function InsightsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const [papers, news, eci, swe, usage, syncs] = await Promise.all([
    prisma.insightItem.findMany({ where: { kind: "PAPER" }, orderBy: { publishedAt: "desc" }, take: 20 }),
    prisma.insightItem.findMany({ where: { kind: "NEWS" }, orderBy: { publishedAt: "desc" }, take: 25 }),
    modelScores("epoch", "eci"),
    modelScores("epoch", "swe_bench_verified"),
    modelScores("openrouter", USAGE_METRIC),
    prisma.insightSync.findMany({
      // distinct 는 읽은 뒤 메모리에서 거르므로 기간을 먼저 좁힘(시간별 수집이라 계속 쌓임).
      where: { startedAt: { gte: daysAgo(14) } },
      distinct: ["source"],
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const lastSync = syncs.filter((s) => s.ok).sort((a, b) => +b.startedAt - +a.startedAt)[0];
  const isEmpty = !papers.length && !news.length && !eci.length && !swe.length && !usage.length;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-bold text-[var(--foreground)]">AI News</h1>
          {lastSync && <p className="text-[13px] text-[var(--muted)]">{timeAgo(lastSync.startedAt)} 갱신</p>}
        </header>

        <StockTicker />

        {isEmpty ? (
          <p className="rounded-[var(--radius-xl)] bg-white px-6 py-16 text-center text-sm text-[var(--muted)]">
            아직 수집된 데이터가 없어요.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="space-y-6 min-w-0">
              {news.length > 0 && (
                <Section
                  title="소식"
                  source={
                    <>
                      <ExternalLink href="https://www.gdeltproject.org/">The GDELT Project</ExternalLink>, Hacker News.
                      기사 제목과 링크만 제공해요.
                      {news.some((n) => n.source === "msit") && <span className="block mt-1">{MSIT_CITATION}</span>}
                    </>
                  }
                >
                  <Expandable items={news} render={(n) => <NewsRow key={n.id} item={n} />} />
                </Section>
              )}

              {papers.length > 0 && (
                <Section title="논문" source="arXiv 메타데이터(CC0). 요약은 자동 생성이므로 정확한 내용은 원문을 확인해 주세요.">
                  <Expandable items={papers} render={(p) => <PaperRow key={p.id} item={p} />} />
                </Section>
              )}
            </div>

            <div className="space-y-6 min-w-0">
              <Section
                title="성능 순위"
                source={
                  <>
                    <ExternalLink href="https://epoch.ai/benchmarks">{EPOCH_CITATION}</ExternalLink> CC BY 4.0
                    {eci[0] && ` · ${longDate(eci[0].asOf)} 기준`}
                  </>
                }
              >
                <div className="space-y-6">
                  <RankList
                    title="종합 역량"
                    hint="여러 벤치마크를 묶은 지수(ECI)"
                    rows={eci.map((r) => ({ ...r, value: r.score.toFixed(1) }))}
                  />
                  <RankList
                    title="코드 수정"
                    hint="실제 저장소 이슈 해결률(SWE-bench Verified)"
                    rows={swe.map((r) => ({ ...r, value: `${(r.score * 100).toFixed(1)}%` }))}
                  />
                </div>
              </Section>

              {usage.length > 0 && (
                <Section
                  title="사용량 순위"
                  source={<ExternalLink href="https://openrouter.ai/rankings">{openrouterCitation(usage[0].asOf)}</ExternalLink>}
                >
                  <RankList
                    hint="하루 토큰 처리량. 성능이 아니라 사용량이라 저렴한 모델이 앞설 수 있어요."
                    rows={usage.map((r) => ({ ...r, value: formatTokens(r.score) }))}
                  />
                </Section>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, source, children }: { title: string; source: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-xl)] bg-white px-5 pt-5 pb-4">
      <h2 className="text-[15px] font-semibold text-[var(--foreground)] mb-3">{title}</h2>
      {children}
      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">{source}</p>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-[var(--foreground)]">
      {children}
    </a>
  );
}

function Expandable<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const rest = items.slice(PREVIEW);
  return (
    <>
      <ul className="divide-y divide-[var(--gray-100)]">{items.slice(0, PREVIEW).map(render)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <MoreToggle count={items.length} />
          <ul className="divide-y divide-[var(--gray-100)] border-t border-[var(--gray-100)]">{rest.map(render)}</ul>
        </details>
      )}
    </>
  );
}

function MoreToggle({ count }: { count: number }) {
  return (
    <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer py-2.5 text-[13px] text-[var(--gray-600)] hover:text-[var(--foreground)]">
      <span className="group-open:hidden">{count}개 모두 보기</span>
      <span className="hidden group-open:inline">접기</span>
    </summary>
  );
}

function NewsRow({ item }: {
  item: { url: string; title: string; source: string; category: string | null; publishedAt: Date };
}) {
  const origin = item.category ?? SOURCE_LABEL[item.source];
  return (
    <li className="py-3 first:pt-0">
      <a href={item.url} target="_blank" rel="noreferrer noopener" className="text-[15px] leading-snug font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
        {item.title}
      </a>
      <p className="mt-1 text-[13px] text-[var(--muted)]">
        {origin && `${origin} · `}
        {shortDate(item.publishedAt)}
      </p>
    </li>
  );
}

function PaperRow({ item }: {
  item: { url: string; title: string; summaryKo: string | null; authors: string[]; category: string | null; publishedAt: Date };
}) {
  const [first, ...others] = item.authors;
  return (
    <li className="py-3.5 first:pt-0">
      <a href={item.url} target="_blank" rel="noreferrer noopener" className="text-[15px] leading-snug font-medium text-[var(--foreground)] hover:text-[var(--accent)]">
        {item.title}
      </a>
      {item.summaryKo && <p className="mt-1.5 text-sm leading-relaxed text-[var(--gray-600)] line-clamp-2">{item.summaryKo}</p>}
      <p className="mt-1.5 text-[13px] text-[var(--muted)]">
        {item.category && `${item.category} · `}
        {shortDate(item.publishedAt)}
        {first && ` · ${first}${others.length ? ` 외 ${others.length}명` : ""}`}
      </p>
    </li>
  );
}

type RankRow = { id: string; rank: number; displayName: string; organization: string | null; value: string };

function RankList({ title, hint, rows }: { title?: string; hint: string; rows: RankRow[] }) {
  const rest = rows.slice(PREVIEW);
  return (
    <div>
      {title && <h3 className="text-sm font-medium text-[var(--foreground)]">{title}</h3>}
      <p className="mt-0.5 mb-2 text-xs leading-relaxed text-[var(--muted)]">{hint}</p>
      {rows.length === 0 ? (
        <p className="py-3 text-[13px] text-[var(--muted)]">데이터가 없어요.</p>
      ) : (
        <>
          <ol>{rows.slice(0, PREVIEW).map((r) => <RankLine key={r.id} row={r} />)}</ol>
          {rest.length > 0 && (
            <details className="group">
              <MoreToggle count={rows.length} />
              <ol>{rest.map((r) => <RankLine key={r.id} row={r} />)}</ol>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function RankLine({ row }: { row: RankRow }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-1 py-1.5 text-sm">
      <span className="text-[13px] tabular-nums text-[var(--muted)]">{row.rank}</span>
      <span className="truncate text-[var(--foreground)]" title={row.displayName}>
        {row.displayName}
        {row.organization && <span className="ml-1.5 text-xs text-[var(--muted)]">{row.organization}</span>}
      </span>
      <span className="pl-3 tabular-nums font-medium text-[var(--foreground)]">{row.value}</span>
    </li>
  );
}
