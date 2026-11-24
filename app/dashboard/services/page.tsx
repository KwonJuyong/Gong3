import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import { serviceKindLabel } from "../../lib/surveyProfile";
import { ui } from "@/app/components/ui";
import CreateShell from "./CreateShell";
import ServiceForm from "./ServiceForm";
import { deleteServiceAction } from "./actions";

export const metadata = { title: "평가 만들기" };

// 평가 방식 셋. 방식마다 첫 단계가 다름: 동행 평가는 평가 대상, 표준 설문은 서비스 유형 등록, 자유 설문은 문항 작성
const METHODS = [
  {
    key: "accompany",
    title: "Evi 동행 평가",
    lead: "학생이 과제를 직접 하며 Evi와 대화로 기록해요.",
    points: [["준비", "평가 대상 → Evi와 과제 인터뷰(문항 없음)"], ["결과", "완료 조건별 예상 대비 실제, 개선 요청"], ["이후", "요청에 답하고 고친 버전으로 재평가"]],
    cta: "동행 평가 만들기",
  },
  {
    key: "standard",
    title: "표준 설문",
    lead: "서비스 유형에 맞춰 검증된 척도로 문항을 만들어 드려요.",
    points: [["준비", "서비스 유형 등록 → 표준 문항 확인·확정"], ["결과", "품질 항목별 점수와 약점 순위"], ["비교", "다른 회차·서비스와 같은 기준으로 비교"]],
    cta: "표준 설문 만들기",
  },
  {
    key: "free",
    title: "자유 설문",
    lead: "문항을 처음부터 직접 써요.",
    points: [["준비", "문항 직접 작성"], ["결과", "응답 원본(엑셀 내보내기)"], ["맞는 경우", "수업 만족도처럼 표준 항목이 맞지 않을 때"]],
    cta: "자유 설문 만들기",
  },
] as const;

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; d?: string; method?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");

  const isAdmin = me.role === "ADMIN";
  const { deleted, d, method: rawMethod } = await searchParams;
  // 동행 평가·자유 설문은 각자의 첫 화면으로 바로 감. 이 화면이 이어서 그리는 방식은 표준 설문뿐
  if (rawMethod === "accompany") redirect(`/dashboard/accompany/new${d ? `?d=${d}` : ""}`);
  const method = rawMethod === "standard" ? rawMethod : null;
  // 달력에서 날짜를 골라 들어오면 어느 방식으로 만들든 그 날짜를 채움
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  const withDate = (href: string) => (date ? `${href}${href.includes("?") ? "&" : "?"}d=${date}` : href);
  const methodHref = (key: string) =>
    key === "free" ? withDate("/dashboard?view=create") : key === "accompany" ? withDate("/dashboard/accompany/new") : withDate(`/dashboard/services?method=${key}`);

  const dateNote = date && (
    <p role="status" className="rounded-[var(--radius-md)] bg-[var(--accent-light)] px-4 py-2.5 text-sm text-[var(--accent)]">
      {date.slice(5, 7).replace(/^0/, "")}월 {date.slice(8).replace(/^0/, "")}일 평가를 만들어요.
    </p>
  );

  if (!method) {
    // 만들다 만 평가로 바로 돌아갈 수 있게 방식과 상관없이 모아 보여 줌
    const [drafts, surveyDrafts] = await Promise.all([
      prisma.project.findMany({
        where: { creatorId: me.id, status: "DRAFT", evalMode: "ACCOMPANY" },
        select: { id: true, title: true, scenario: { select: { projectId: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.service.findMany({
        where: { ownerId: me.id, surveys: { some: { status: "DRAFT" } } },
        select: { id: true, name: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const resume = [
      ...drafts.map((p) => ({ key: p.id, title: p.title, kind: "Evi 동행 평가", step: p.scenario ? "모집·비용" : "Evi 과제 인터뷰", href: p.scenario ? `/dashboard/accompany/${p.id}/recruit` : `/dashboard?view=task&p=${p.id}` })),
      ...surveyDrafts.map((v) => ({ key: v.id, title: v.name, kind: "표준 설문", step: "표준 문항 확정", href: `/dashboard/services/${v.id}` })),
    ];
    return (
      <div className="min-h-screen bg-[var(--surface)]">
        <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
          <ClearQueryParams keys={["deleted"]} />
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">평가 만들기</h1>
            <p className={ui.hint}>평가 방식을 하나 골라 주세요. 방식마다 준비하는 것과 받는 결과가 달라요. 만드는 중에도 위쪽 탭으로 방식을 바꿀 수 있어요.</p>
          </header>
          {dateNote}
          {deleted === "1" && <p role="status" className={ui.hint}>서비스를 삭제했어요.</p>}
          {resume.length > 0 && (
            <details className={`${ui.panel} space-y-2`}>
              <summary className="cursor-pointer text-base font-bold">만들던 평가 이어서 하기 ({resume.length}건)</summary>
              <ul className="divide-y divide-[var(--gray-100)]">
                {resume.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{r.title}</span>
                      <span className={`block ${ui.hint}`}>{r.kind} · 다음 단계 {r.step}</span>
                    </span>
                    <Link href={r.href} className={ui.primarySm}>이어서 하기</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {METHODS.map((m) => (
              <li key={m.key}>
                <Link href={methodHref(m.key)} className={`group flex h-full flex-col gap-5 ${ui.panel} ring-1 ring-[var(--gray-200)] transition-shadow hover:ring-2 hover:ring-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}>
                  <span className="space-y-1.5">
                    <span className="block text-lg font-bold">{m.title}</span>
                    <span className="block text-sm text-[var(--gray-700)]">{m.lead}</span>
                  </span>
                  <dl className="space-y-2 border-t border-[var(--gray-100)] pt-4 text-sm">
                    {m.points.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                        <dt className="text-[var(--muted)]">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <span className={`${ui.primary} mt-auto w-full`}>{m.cta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </div>
    );
  }

  // 관리자는 전체, 그 외는 본인 소유 서비스만
  const services = await prisma.service.findMany({
    where: isAdmin ? {} : { ownerId: me.id },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true } },
      surveys: {
        where: { status: { in: ["DRAFT", "CONFIRMED"] } },
        select: { status: true, sourcedProjects: { select: { _count: { select: { responses: true } } } } },
      },
    },
  });

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["deleted"]} />
        <CreateShell method="standard" step={1} date={date || undefined} title="표준 설문 만들기"
          lead="서비스 유형과 기능이 표준 문항을 정해요. 새 서비스를 등록하거나 등록한 서비스로 이어서 만들어요.">
        {dateNote}
        {deleted === "1" && <p role="status" className={ui.hint}>서비스를 삭제했어요.</p>}

        <ServiceForm defaultOpen={services.length === 0} date={date} />

        {services.length > 0 && <section className={`${ui.panel} divide-y divide-[var(--gray-100)] py-2 sm:py-3`}>
          <h2 className="py-3 text-base font-bold">등록한 서비스로 만들기</h2>
          {services.map((s) => {
            const confirmed = s.surveys.some((v) => v.status === "CONFIRMED");
            const drafting = s.surveys.some((v) => v.status === "DRAFT");
            const responses = s.surveys.reduce((n, v) => n + v.sourcedProjects.reduce((m, p) => m + p._count.responses, 0), 0);
            // 이 서비스의 다음 할 일 하나와 결과 하나만 보임
            const next = drafting
              ? { label: "문항 초안 이어쓰기", href: `/dashboard/services/${s.id}` }
              : confirmed
                ? { label: "확정 문항으로 모집 설정", href: withDate(`/dashboard?view=create-auto&s=${s.id}`) }
                : { label: "문항 만들기", href: `/dashboard/services/${s.id}` };
            const result = responses > 0 && { label: `설문 리포트 (응답 ${responses})`, href: `/dashboard/services/${s.id}/report` };
            const status = drafting ? "문항 작성 중" : confirmed ? "문항 확정" : "";
            return (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{s.name}</p>
                  <p className={`${ui.hint} mt-0.5`}>
                    {serviceKindLabel(s.preset, s.modality)}
                    {isAdmin && s.owner?.name ? ` · 등록자 ${s.owner.name}` : ""}
                    {status && ` · ${status}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={next.href} className={ui.primarySm}>{next.label}</Link>
                  {result && (
                    <Link href={result.href} className={ui.secondarySm}>{result.label}</Link>
                  )}
                  <details className="relative">
                    <summary className={`${ui.secondarySm} list-none cursor-pointer`}>더보기</summary>
                    <div className="absolute right-0 top-full z-20 mt-1 flex w-44 flex-col rounded-[var(--radius-lg)] border border-[var(--gray-200)] bg-white p-1 shadow-[var(--shadow-lg)]">
                      {confirmed && (
                        <Link href={`/dashboard/services/${s.id}`} className="rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-[var(--gray-50)]">문항 관리</Link>
                      )}
                      <form action={deleteServiceAction}>
                        <input type="hidden" name="serviceId" value={s.id} />
                        <input type="hidden" name="method" value={method} />
                        <ConfirmButton
                          message={`「${s.name}」 서비스를 삭제할까요?\n\n· 되돌릴 수 없어요.\n· 의뢰가 붙은 서비스는 삭제되지 않아요.`}
                          danger
                          confirmLabel="삭제"
                          className="w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--gray-50)]"
                        >
                          서비스 삭제
                        </ConfirmButton>
                      </form>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </section>}
        </CreateShell>
      </main>
    </div>
  );
}
