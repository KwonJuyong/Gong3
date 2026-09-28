import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import Link from "next/link";
import { prisma } from "../../db";
import { EPOCH_CITATION } from "../../lib/insights/epoch";
import { openrouterCitation, USAGE_METRIC } from "../../lib/insights/openrouter";
import { MSIT_CITATION } from "../../lib/insights/msit";
import StockTicker from "./StockTicker";

export const metadata = { title: "AI News" };

// AI News. 화면은 DB 만 읽고 외부 API 는 /api/insights/sync 에서만 호출한다.
// 목록은 상위 PREVIEW_N 개만 펼치고 나머지는 <details> 로 접는다(JS 없이 동작해 서버 컴포넌트로 둔다).

export const dynamic = "force-dynamic";

/** 접기 전에 보여주는 개수(모든 섹션 공통) */
const PREVIEW_N = 5;

/** 출처별 아이콘 */
const SOURCE_ICON: Record<string, string> = {
  arxiv: "📄",
  hn: "🟠",
  gdelt: "🌐",
  msit: "🇰🇷",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/** 토큰량을 조·억 단위로 줄여 쓴다. */
function fmtTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  return n.toLocaleString("ko-KR");
}

function fmtAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default async function InsightsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const [papers, news, eci, swe, usage, syncs] = await Promise.all([
    prisma.insightItem.findMany({
      where: { kind: "PAPER" },
      orderBy: { publishedAt: "desc" },
      take: 20,
    }),
    prisma.insightItem.findMany({
      where: { kind: "NEWS" },
      orderBy: { publishedAt: "desc" },
      take: 25,
    }),
    prisma.modelScore.findMany({
      where: { source: "epoch", metric: "eci" },
      orderBy: { rank: "asc" },
      take: 15,
    }),
    prisma.modelScore.findMany({
      where: { source: "epoch", metric: "swe_bench_verified" },
      orderBy: { rank: "asc" },
      take: 15,
    }),
    // 실사용 순위(성능 순위와 별도 섹션)
    prisma.modelScore.findMany({
      where: { source: "openrouter", metric: USAGE_METRIC },
      orderBy: { rank: "asc" },
      take: 15,
    }),
    // 소스별 최근 실행 1건(마지막 갱신 시각 표시용)
    prisma.insightSync.findMany({
      distinct: ["source"],
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const lastOk = syncs.filter((s) => s.ok).sort((a, b) => +b.startedAt - +a.startedAt)[0];
  const isEmpty =
    papers.length === 0 &&
    news.length === 0 &&
    eci.length === 0 &&
    swe.length === 0 &&
    usage.length === 0;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">AI News</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              모델 순위와 최신 논문을 한 화면에서 봅니다. 제목을 누르면 원문으로 이동합니다.
            </p>
          </div>
          {lastOk && (
            <p className="text-xs text-[var(--muted)]">
              <span aria-hidden="true">🔄</span> 마지막 갱신 {fmtAgo(lastOk.startedAt)}
            </p>
          )}
        </div>

        {/* 시세는 DB 와 무관하게 위젯이 그리므로 수집 전에도 보이도록 분기 밖에 둔다. */}
        <StockTicker />

        {isEmpty ? (
          <div className="rounded-[var(--radius-lg)] bg-white px-6 py-12 text-center">
            <p className="text-sm text-[var(--muted)]">
              아직 수집된 데이터가 없습니다. 관리자가 첫 수집을 실행하면 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            {/* 모델 순위(성능) */}
            <section className="rounded-[var(--radius-lg)] bg-white overflow-hidden">
              <SectionHeader
                icon="🏆"
                title="모델 순위 · 성능"
                note="벤치마크 점수 기준입니다. 실제로 많이 쓰이는 모델과는 다를 수 있습니다."
              />
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--gray-100)]">
                <ScoreTable
                  title="종합 역량 (ECI)"
                  note="Epoch Capabilities Index — 여러 벤치마크를 하나의 지수로 묶은 값"
                  rows={eci.map((r) => ({ ...r, value: r.score.toFixed(1) }))}
                />
                <ScoreTable
                  title="코드 수정 (SWE-bench Verified)"
                  note="실제 저장소의 이슈를 고치는 과제 성공률"
                  rows={swe.map((r) => ({ ...r, value: `${(r.score * 100).toFixed(1)}%` }))}
                />
              </div>
              <div className="px-5 py-3 bg-[var(--gray-50)] border-t border-[var(--gray-100)]">
                {/* CC-BY 출처 표기 */}
                <p className="text-xs text-[var(--muted)]">
                  출처:{" "}
                  <a
                    href="https://epoch.ai/benchmarks"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline hover:text-[var(--foreground)]"
                  >
                    {EPOCH_CITATION}
                  </a>{" "}
                  CC BY 4.0
                  {eci[0] && <> · 기준 {fmtDate(eci[0].asOf)}</>}
                </p>
              </div>
            </section>

            {/* 모델 순위(실사용). 성능과 지표 성격이 달라 별도 섹션으로 둔다. */}
            {usage.length > 0 && (
              <section className="rounded-[var(--radius-lg)] bg-white overflow-hidden">
                <SectionHeader
                  icon="🔥"
                  title="모델 순위 · 실사용"
                  note="실제 사용된 토큰량 기준입니다. 성능이 아니라 인기도라 싸고 빠른 모델이 상위에 옵니다."
                />
                <ScoreTable
                  title="토큰 사용량"
                  note="OpenRouter를 통해 하루 동안 처리된 토큰의 총량"
                  rows={usage.map((r) => ({ ...r, value: fmtTokens(r.score) }))}
                />
                <div className="px-5 py-3 bg-[var(--gray-50)] border-t border-[var(--gray-100)]">
                  {/* OpenRouter 출처 표기(기준일 포함) */}
                  <p className="text-xs text-[var(--muted)]">
                    <a
                      href="https://openrouter.ai/rankings"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline hover:text-[var(--foreground)]"
                    >
                      {openrouterCitation(usage[0].asOf)}
                    </a>
                  </p>
                </div>
              </section>
            )}

            {/* 뉴스 */}
            {news.length > 0 && (
              <section className="rounded-[var(--radius-lg)] bg-white overflow-hidden">
                <SectionHeader
                  icon="📰"
                  title="AI 소식"
                  note="제목과 출처만 싣습니다. 내용은 원문에서 확인하세요."
                />
                <CollapsibleList
                  items={news}
                  renderItem={(n) => <NewsRow key={n.id} item={n} />}
                />
                <div className="px-5 py-3 bg-[var(--gray-50)] border-t border-[var(--gray-100)]">
                  {/* GDELT 출처 표기 */}
                  <p className="text-xs text-[var(--muted)]">
                    출처:{" "}
                    <a
                      href="https://www.gdeltproject.org/"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline hover:text-[var(--foreground)]"
                    >
                      The GDELT Project
                    </a>
                    , Hacker News. 기사 제목과 링크만 제공하며 본문은 각 언론사에 있습니다.
                  </p>
                  {/* 공공누리 1유형 출처 표기 */}
                  {news.some((n) => n.source === "msit") && (
                    <p className="text-xs text-[var(--muted)] mt-1">{MSIT_CITATION}</p>
                  )}
                </div>
              </section>
            )}

            {/* 논문 */}
            <section className="rounded-[var(--radius-lg)] bg-white overflow-hidden">
              <SectionHeader icon="📄" title="최신 논문" note="arXiv cs.AI · cs.LG · cs.CL" />
              <CollapsibleList
                items={papers}
                renderItem={(p) => <PaperRow key={p.id} item={p} />}
              />
              <div className="px-5 py-3 bg-[var(--gray-50)] border-t border-[var(--gray-100)]">
                <p className="text-xs text-[var(--muted)]">
                  제목·초록은 arXiv 메타데이터(CC0)이며, 요약은 자동 생성입니다. 정확한 내용은 원문을 확인하세요.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SectionHeader({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <div className="px-5 py-4 border-b border-[var(--gray-100)]">
      <h3 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
        {/* 장식용 아이콘이라 스크린리더에서 감춘다 */}
        <span aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <p className="text-xs text-[var(--muted)] mt-1">{note}</p>
    </div>
  );
}

/** 상위 PREVIEW_N 개만 펼치고 나머지는 <details> 로 접는다. */
function CollapsibleList<T>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  const head = items.slice(0, PREVIEW_N);
  const tail = items.slice(PREVIEW_N);

  return (
    <>
      <ul className="divide-y divide-[var(--gray-100)]">{head.map(renderItem)}</ul>
      {tail.length > 0 && (
        <details className="group border-t border-[var(--gray-100)]">
          <summary className="px-5 py-2.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--gray-50)] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">▾ 더보기 {tail.length}개</span>
            <span className="hidden group-open:inline">▴ 접기</span>
          </summary>
          <ul className="divide-y divide-[var(--gray-100)] border-t border-[var(--gray-100)]">
            {tail.map(renderItem)}
          </ul>
        </details>
      )}
    </>
  );
}

type NewsItemRow = {
  id: string;
  url: string;
  title: string;
  source: string;
  category: string | null;
  publishedAt: Date;
};

function NewsRow({ item }: { item: NewsItemRow }) {
  return (
    <li className="px-5 py-3 flex gap-2.5">
      <span aria-hidden="true" className="shrink-0 text-sm leading-6">
        {SOURCE_ICON[item.source] ?? "🌐"}
      </span>
      <div className="min-w-0">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-[var(--foreground)] hover:text-[var(--accent)]"
        >
          {item.title}
        </a>
        <p className="text-xs text-[var(--muted)] mt-1">
          {item.category && <span className="mr-2">{item.category}</span>}
          {fmtDate(item.publishedAt)}
          {item.source === "hn" && <span className="ml-2">· Hacker News</span>}
        </p>
      </div>
    </li>
  );
}

type PaperItemRow = {
  id: string;
  url: string;
  title: string;
  summaryKo: string | null;
  authors: string[];
  category: string | null;
  publishedAt: Date;
};

function PaperRow({ item }: { item: PaperItemRow }) {
  return (
    <li className="px-5 py-4 flex gap-2.5">
      <span aria-hidden="true" className="shrink-0 text-sm leading-6">
        📄
      </span>
      <div className="min-w-0">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
        >
          {item.title}
        </a>
        {/* 요약이 없으면 제목과 링크만 보인다 */}
        {item.summaryKo && (
          <p className="text-sm text-[var(--gray-600)] mt-1.5 leading-relaxed">{item.summaryKo}</p>
        )}
        <p className="text-xs text-[var(--muted)] mt-2">
          {item.category && <span className="mr-2">{item.category}</span>}
          {fmtDate(item.publishedAt)}
          {item.authors.length > 0 && (
            <span className="ml-2">
              · {item.authors[0]}
              {item.authors.length > 1 && ` 외 ${item.authors.length - 1}명`}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

type ScoreRow = {
  id: string;
  rank: number;
  displayName: string;
  organization: string | null;
  value: string;
};

function ScoreTable({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: ScoreRow[];
}) {
  const head = rows.slice(0, PREVIEW_N);
  const tail = rows.slice(PREVIEW_N);

  return (
    <div className="px-5 py-4">
      <h4 className="text-sm font-semibold text-[var(--foreground)]">{title}</h4>
      <p className="text-xs text-[var(--muted)] mt-0.5 mb-3">{note}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted)] py-4">데이터가 없습니다.</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {head.map((r) => (
              <ScoreLine key={r.id} row={r} />
            ))}
          </ol>
          {tail.length > 0 && (
            <details className="group mt-1.5">
              <summary className="py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▾ 더보기 {tail.length}개</span>
                <span className="hidden group-open:inline">▴ 접기</span>
              </summary>
              <ol className="space-y-1.5 pt-1.5">
                {tail.map((r) => (
                  <ScoreLine key={r.id} row={r} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** 순위 한 줄. 상위 3위는 메달로 표시한다. */
function ScoreLine({ row }: { row: ScoreRow }) {
  const medal = ["🥇", "🥈", "🥉"][row.rank - 1];

  return (
    <li className="flex items-baseline gap-3 text-sm">
      <span className="w-5 shrink-0 text-xs tabular-nums text-[var(--gray-500)]">
        {medal ? (
          <>
            <span aria-hidden="true" className="text-sm">
              {medal}
            </span>
            {/* 스크린리더용 순위 텍스트 */}
            <span className="sr-only">{row.rank}위</span>
          </>
        ) : (
          row.rank
        )}
      </span>
      <span className="flex-1 min-w-0 truncate text-[var(--foreground)]">
        {row.displayName}
        {row.organization && (
          <span className="ml-1.5 text-xs text-[var(--muted)]">{row.organization}</span>
        )}
      </span>
      <span className="shrink-0 tabular-nums font-medium text-[var(--foreground)]">
        {row.value}
      </span>
    </li>
  );
}
