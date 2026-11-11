import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../db";
import { isConstructActive, type ServiceProfile } from "../../../lib/surveyProfile";
import { generateDraftsAction, freezeVersionAction } from "../actions";
import CreateSteps from "../CreateSteps";
import DraftEditor from "./DraftEditor";

export const metadata = { title: "평가문항 관리" };

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
  const nameById = new Map(constructs.map((c) => [c.id, c.name]));

  // 활성 검증도구 블록(잠금): instrument != null
  const lockedInstruments = active.filter((c) => c.instrument);
  // LLM 적응 대상(문구 생성 필요): instrument == null
  const adaptiveCount = active.filter((c) => !c.instrument).length;

  const drafts = version?.drafts ?? [];
  const approvedCount = drafts.filter((d) => d.approved).length;

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["created", "generated", "saved", "frozen", "n"]} />
        <Link href="/dashboard/services" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 평가 만들기
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">{service.name}</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {service.preset ? `${service.preset} · ` : ""}
              {service.modality} · 평가 항목 {active.length}개
              {version ? ` · 회차 ${version.round} (작성중)` : ""}
            </p>
          </div>
          <Link
            href={`/dashboard/services/${service.id}/report`}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs text-[var(--foreground)] hover:bg-white shrink-0"
          >
            평가 리포트
          </Link>
        </div>

        <CreateSteps current={confirmed ? 3 : 2} />

        {created === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            서비스를 등록했어요. 이제 「평가문항 생성」을 눌러 평가문항을 만들어 주세요.
          </div>
        )}
        {generated === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            서비스에 맞춘 문항 문구를 자동으로 만들었습니다. 검토 후 확정하세요.
          </div>
        )}
        {generated === "0" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            자동으로 만들 서비스 맞춤 문항이 없습니다(모두 검증된 표준 도구로 측정합니다).
          </div>
        )}
        {saved === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            문항이 저장되었습니다.
          </div>
        )}
        {/* 동결만으로는 공개되지 않고, 평가를 만들어 승인받아야 한다는 안내 */}
        {frozen === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            평가문항을 최종 확정했습니다. <strong>아직 학생에게 공개되지 않습니다</strong> —
            아래에서 이 평가문항으로 평가를 만들고 관리자 승인을 받으면 모집이 시작됩니다.
          </div>
        )}
        {frozen === "none" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            최종 확정할 작성 중 평가문항이 없습니다. 먼저 문구를 만드세요.
          </div>
        )}
        {frozen === "unapproved" && (
          <div className="rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5">
            확정하지 않은 문항이 {searchN}개 있습니다. 최종 확정은 되돌릴 수 없으므로 먼저 검토해
            주세요. 그대로 진행하려면 확정 버튼 옆 <strong>확인란</strong>을 체크하세요.
          </div>
        )}

        {/* 다음 단계: 동결된 설문으로 평가 만들기 */}
        {confirmed && (
          <section className="bg-white rounded-[var(--radius-xl)] border border-[var(--accent)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                이 서비스로 평가를 만들 수 있습니다
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                확정된 평가문항이 그대로 이 평가의 문항이 됩니다. 일정과 인원만 정하면 됩니다.
              </p>
            </div>
            <Link
              href={`/dashboard?view=create-auto&s=${service.id}`}
              className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap text-center shrink-0"
            >
              이 서비스로 평가 만들기
            </Link>
          </section>
        )}

        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">서비스 맞춤 문항</h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                평가 항목과 척도는 고정하고 문구만 서비스에 맞게 생성됩니다. ({adaptiveCount}개 대상 · 확정 {approvedCount}/{drafts.length})
              </p>
            </div>
            <form action={generateDraftsAction}>
              <input type="hidden" name="serviceId" value={service.id} />
              <ConfirmButton
                message={
                  drafts.length > 0
                    ? "AI 로 평가문항을 다시 생성합니다.\n\n· 생성 원문이 새 문구로 바뀝니다(직접 고친 문구와 확정 표시는 유지).\n· AI 호출 비용이 듭니다.\n\n정말 재생성하시겠습니까?"
                    : "AI 로 평가문항을 생성합니다.\n\n· AI 호출 비용이 들고 1분 정도 걸릴 수 있습니다.\n\n생성하시겠습니까?"
                }
                className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap"
              >
                {drafts.length > 0 ? "문구 재생성" : "평가문항 생성"}
              </ConfirmButton>
            </form>
          </div>

          {drafts.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] py-6 text-center">
              아직 생성된 문항이 없습니다. 「평가문항 생성」을 눌러 시작하세요.
            </p>
          ) : (
            <div className="space-y-3">
              {drafts.map((d) => (
                <DraftEditor
                  key={d.id}
                  draft={{
                    id: d.id,
                    generated: d.generated,
                    edited: d.edited,
                    approved: d.approved,
                    scaleType: d.scaleType,
                  }}
                  constructName={nameById.get(d.constructId) ?? d.constructId}
                />
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <>
              {/* 전체 문항 미리보기(동결 전 검수용) */}
              <div className="mt-4 pt-4 border-t border-[var(--gray-200)]">
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)] hover:text-[var(--accent)] transition-colors select-none">
                    전체 문항 미리보기 (최종 확정 전 검토)
                  </summary>
                  <div className="mt-3 space-y-2">
                    {drafts.map((d, idx) => {
                      const finalText = (d.edited || d.generated).trim();
                      return (
                        <div
                          key={d.id}
                          className={`px-3 py-2.5 rounded-[var(--radius-md)] border text-sm ${
                            d.approved
                              ? "border-green-200 bg-green-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-mono text-[var(--muted)] shrink-0 mt-0.5">Q{idx + 1}</span>
                            <p className="flex-1 text-[var(--foreground)]">{finalText}</p>
                            {!d.approved && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 shrink-0">미확정</span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--muted)] mt-1 ml-6">
                            {nameById.get(d.constructId) ?? d.constructId} · {d.scaleType}
                          </p>
                        </div>
                      );
                    })}
                    {lockedInstruments.length > 0 && (
                      <p className="text-xs text-[var(--muted)] pt-1">
                        + 검증된 측정 문항 ({lockedInstruments.map((c) => c.name).join(", ")}) 이 추가됩니다.
                      </p>
                    )}
                  </div>
                </details>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--gray-200)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-[var(--muted)]">
                  {approvedCount < drafts.length
                    ? `미확정 문항 ${drafts.length - approvedCount}개가 있습니다. 최종 확정하면 자동 생성된 문구가 그대로 쓰이고 되돌릴 수 없습니다.`
                    : "모든 문항을 검토했습니다. 최종 확정하면 이 평가문항으로 평가를 만들 수 있습니다."}
                </p>
                {/* 동결은 되돌릴 수 없어, 미확정 문항이 있으면 체크했을 때만 진행함(서버도 확인). */}
                <form action={freezeVersionAction} className="flex items-center gap-3 shrink-0">
                  <input type="hidden" name="serviceId" value={service.id} />
                  {approvedCount < drafts.length && (
                    <label className="flex items-center gap-1.5 text-xs text-[var(--warning)] cursor-pointer">
                      <input type="checkbox" name="allowUnapproved" className="accent-[var(--warning)]" />
                      미확정분 그대로 진행
                    </label>
                  )}
                  <ConfirmButton
                    message={
                      "이 회차 평가문항을 최종 확정합니다.\n\n· 확정하면 문항을 더 고칠 수 없고 되돌릴 수 없습니다.\n" +
                      (approvedCount < drafts.length
                        ? `· 미확정 문항 ${drafts.length - approvedCount}개는 자동 생성된 문구 그대로 쓰입니다.\n`
                        : "") +
                      "· 확정한 평가문항으로 평가를 만들 수 있게 됩니다.\n\n정말 최종 확정하시겠습니까?"
                    }
                    confirmLabel="최종 확정"
                    className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap"
                  >
                    평가문항 최종 확정
                  </ConfirmButton>
                </form>
              </div>
            </>
          )}
        </section>

        {/* 검증도구 블록(잠금) */}
        <section className="bg-white rounded-[var(--radius-xl)] p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">검증된 측정 문항 (고정)</h3>
          <p className="text-xs text-[var(--muted)] mb-3">
            원문 그대로 사용되며 편집할 수 없습니다. 점수 신뢰도를 지키기 위해 자동 생성 대상에서 제외합니다.
          </p>
          {lockedInstruments.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] py-4 text-center">포함된 검증된 측정 문항이 없습니다.</p>
          ) : (
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
          )}
        </section>
      </main>
    </div>
  );
}
