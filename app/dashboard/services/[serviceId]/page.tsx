import ClearQueryParams from "@/app/components/ClearQueryParams";
import { ui } from "@/app/components/ui";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../db";
import { isConstructActive, serviceKindLabel, type ServiceProfile } from "../../../lib/surveyProfile";
import { generateDraftsAction } from "../actions";
import { CreateNav } from "../CreateShell";
import { reviewStamp } from "../reviewStamp";
import DraftEditor from "./DraftEditor";
import GenerateButton from "./GenerateButton";

export const metadata = { title: "표준 설문 문항" };

const INSTRUMENT_LABEL: Record<string, string> = {
  SUS: "SUS (시스템 사용성 척도, 10문항)",
  UEQ: "UEQ (사용자 경험, 26문항 · 7점)",
  NASA_TLX: "NASA-TLX (인지 부하, 6차원)",
  CSAT_NPS: "CSAT / NPS (만족·추천)",
  S_TIAS: "S-TIAS (신뢰, 3문항 · 7점)",
  UES_SF: "UES-SF (학습 몰입, 12문항 · 5점)",
  CLS8: "CLS-8 (학습 인지 부하, 8문항 · 0~10점)",
};

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ created?: string; generated?: string; saved?: string; frozen?: string; n?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");

  const { serviceId } = await params;
  const { created, generated, saved, frozen, n: searchN } = await searchParams;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) notFound();
  if (service.ownerId !== me.id && me.role !== "ADMIN") redirect("/dashboard/services");

  const profile: ServiceProfile = {
    isAiService: service.isAiService,
    hasRecommendation: service.hasRecommendation,
    isSafetyCritical: service.isSafetyCritical,
    hasPersonalData: service.hasPersonalData,
    userFacingUi: service.userFacingUi,
    preset: service.preset,
    modality: service.modality,
  };

  const [constructs, version, confirmed] = await Promise.all([
    prisma.construct.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.surveyVersion.findFirst({
      where: { serviceId, status: "DRAFT" },
      orderBy: { round: "desc" },
      include: { drafts: true },
    }),
    // 동결된 설문이 있으면 이 서비스로 바로 평가를 만들 수 있음
    prisma.surveyVersion.findFirst({
      where: { serviceId, status: "CONFIRMED" },
      orderBy: { round: "desc" },
      select: { id: true },
    }),
  ]);

  const active = constructs.filter((c) => isConstructActive(c, profile));

  // 활성 검증도구 블록(잠금): instrument != null
  const lockedInstruments = active.filter((c) => c.instrument);
  // LLM 적응 대상(문구 생성 필요): instrument == null
  const adaptiveCount = active.filter((c) => !c.instrument).length;

  const drafts = version?.drafts ?? [];
  const questions = active.flatMap(c => {
    const d = drafts.find(row => row.constructId === c.id);
    return d ? [{ id: d.id, label: c.evaluator === "DEVELOPER" ? c.name + " · 개발사 응답" : c.name, text: d.edited ?? d.generated }] : [];
  });

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["created", "generated", "saved", "frozen", "n"]} />
        <CreateNav method="standard" step={2} targets={{ 1: { href: "/dashboard/services?method=standard" } }} />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">{service.name} 표준 문항</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {serviceKindLabel(service.preset, service.modality)} · 평가 항목 {active.length}개
              {version ? ` · 회차 ${version.round} (작성중)` : ""}
            </p>
          </div>
          <Link
            href={`/dashboard/services/${service.id}/report`}
            className={ui.textButton}
          >
            설문 리포트
          </Link>
        </div>

        {created === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            서비스를 등록했어요.
          </div>
        )}
        {generated === "0" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            자동으로 만들 서비스 맞춤 문항이 없습니다(모두 검증된 표준 도구로 측정합니다).
          </div>
        )}
        {generated === "fail" && (
          <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] text-sm px-4 py-2.5">
            평가문항을 만들지 못했어요. 잠시 뒤 아래 「평가문항 생성」을 다시 눌러 주세요.
          </div>
        )}
        {saved === "changed" && <p role="alert">다른 화면에서 설문이 변경됐어요. 최신 문항을 확인해 주세요.</p>}
        {saved === "invalid" && <p role="alert">비어 있는 문항을 입력해 주세요.</p>}
        {saved === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            수정한 문항을 저장했어요.
          </div>
        )}
        {frozen === "empty" && <p role="alert">확정할 문항이 없어요. 운영자에게 이 서비스의 평가 항목 설정을 문의해 주세요.</p>}
        {frozen === "none" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            최종 확정할 작성 중 평가문항이 없습니다. 먼저 문구를 만드세요.
          </div>
        )}
        {frozen === "unapproved" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            검토할 문항이 {searchN}개 있어요. 문항을 읽은 뒤 아래에서 확정해 주세요.
          </div>
        )}

        {/* 다음 단계: 동결된 설문으로 평가 만들기 */}
        {confirmed && !version && (
          <section className="bg-white rounded-[var(--radius-xl)] border border-[var(--accent)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                문항을 확정했어요
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                확정한 문항으로 표준 설문을 만들어요. 이제 모집 일정과 비용 처리를 정해요.
              </p>
            </div>
            <Link
              href={`/dashboard?view=create-auto&s=${service.id}`}
              className={ui.primary}
            >
              다음: 모집·비용
            </Link>
          </section>
        )}

        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">서비스 맞춤 문항</h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {drafts.length ? `맞춤 문항 ${questions.length}개 · 바꾸고 싶은 질문만 수정하세요.` : `서비스 특성에 맞춰 질문 ${adaptiveCount}개를 작성해요.`}
              </p>
            </div>
            {drafts.length > 0 ? (
              // 재생성은 생성 원문을 덮어써서 확인을 받음
              <form action={generateDraftsAction}>
                <input type="hidden" name="serviceId" value={service.id} />
                <ConfirmButton
                  message={"AI 로 평가문항을 다시 생성합니다.\n\n· 생성 원문이 새 문구로 바뀝니다(저장한 수정 문구는 유지되고 저장 전 수정은 사라져요).\n· AI 호출 비용이 듭니다.\n\n정말 재생성하시겠습니까?"}
                  pendingText="문항 만드는 중…"
                  className={ui.secondary}
                >
                  문구 재생성
                </ConfirmButton>
              </form>
            ) : (
              <GenerateButton serviceId={service.id} auto={created === "1"} secondary={!!confirmed} />
            )}
          </div>

          {drafts.length === 0 && adaptiveCount > 0 ? (
            <p className="text-sm text-[var(--gray-500)] py-6 text-center">
              {created === "1" ? "초안이 준비되면 여기에 표시돼요." : "설문 초안을 만들면 여기에서 질문을 읽고 수정할 수 있어요."}
            </p>
          ) : (
            version && <DraftEditor key={reviewStamp(drafts)} questions={questions} serviceId={service.id} versionId={version.id} stamp={reviewStamp(drafts)} />
          )}
        </section>

        {/* 검증도구 블록(잠금) */}
        {lockedInstruments.length > 0 && <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <details><summary className="cursor-pointer text-sm font-semibold">함께 포함되는 표준 척도 ({lockedInstruments.length}종)</summary>
          <p className="text-xs text-[var(--muted)] mb-3">
            원문 그대로 사용되며 편집할 수 없습니다. 점수 신뢰도를 지키기 위해 자동 생성 대상에서 제외합니다.
          </p>
            <ul className="space-y-2">
              {lockedInstruments.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-[var(--surface)]"
                >
                  <span className="text-sm text-[var(--foreground)]">{c.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {c.instrument ? INSTRUMENT_LABEL[c.instrument] ?? c.instrument : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>}
      </main>
    </div>
  );
}
