import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import { isConstructActive, type ServiceProfile } from "../../lib/surveyProfile";
import CreateSteps from "./CreateSteps";
import ServiceForm from "./ServiceForm";
import { deleteServiceAction } from "./actions";

export const metadata = { title: "평가 만들기" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");

  const isAdmin = me.role === "ADMIN";
  const { deleted } = await searchParams;

  // 관리자는 전체, 그 외는 본인 소유 서비스만
  const [services, constructs] = await Promise.all([
    prisma.service.findMany({
      where: isAdmin ? {} : { ownerId: me.id },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true } },
        // 서비스마다 다음 할 일을 하나로 정하는 데 씀
        surveys: { where: { status: { in: ["DRAFT", "CONFIRMED"] } }, select: { status: true } },
      },
    }),
    prisma.construct.findMany({
      where: { active: true },
      select: { id: true, group: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div className="min-h-screen bg-[var(--surface)]">

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["deleted"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">평가 만들기</h1>
          <p className="text-sm text-[var(--muted)] mt-1 mb-3">
            서비스를 등록하고 평가문항을 확정하면 표준에 맞춘 문항으로 평가를 만들 수 있어요.
          </p>
          <CreateSteps />
        </div>

        {deleted === "1" && (
          <div className="rounded-[var(--radius-md)] bg-gray-50 border border-gray-200 text-gray-600 text-sm px-4 py-2.5">
            서비스가 삭제되었습니다.
          </div>
        )}

        <ServiceForm defaultOpen={services.length === 0} />

        <section className="space-y-3">
          {services.map((s) => {
            const confirmed = s.surveys.some((v) => v.status === "CONFIRMED");
            const drafting = s.surveys.some((v) => v.status === "DRAFT");
            const next = confirmed
              ? { label: "평가 만들기", href: `/dashboard?view=create-auto&s=${s.id}` }
              : { label: drafting ? "평가문항 이어서 작성" : "평가문항 만들기", href: `/dashboard/services/${s.id}` };
            const profile: ServiceProfile = {
              isAiService: s.isAiService,
              hasRecommendation: s.hasRecommendation,
              isSafetyCritical: s.isSafetyCritical,
              hasPersonalData: s.hasPersonalData,
              userFacingUi: s.userFacingUi,
              preset: s.preset,
              modality: s.modality,
            };
            const active = constructs.filter((c) => isConstructActive(c, profile));
            const aiOn = active.some((c) => c.group === "A_AI");
            const domainOn = active.filter((c) => c.group === "A_DOMAIN");

            return (
              <div
                key={s.id}
                className="bg-white rounded-[var(--radius-xl)] p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{s.name}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {s.preset ? `${s.preset} · ` : ""}
                      {s.modality}
                      {isAdmin && s.owner?.name ? ` · 등록자 ${s.owner.name}` : ""}
                      {` · 평가문항 ${confirmed ? "확정" : drafting ? "작성 중" : "없음"}`}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        평가 항목 {active.length}개
                      </span>
                      {aiOn && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          AI 평가 항목
                        </span>
                      )}
                      {domainOn.map((c) => (
                        <span
                          key={c.id}
                          className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                        >
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={next.href}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap"
                    >
                      {next.label}
                    </Link>
                    {confirmed && (
                      <Link
                        href={`/dashboard/services/${s.id}`}
                        className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs text-[var(--foreground)] hover:bg-[var(--surface)] whitespace-nowrap"
                      >
                        평가문항 관리
                      </Link>
                    )}
                    <form action={deleteServiceAction}>
                      <input type="hidden" name="serviceId" value={s.id} />
                      <ConfirmButton
                        message={`「${s.name}」 서비스를 삭제합니다.\n\n· 되돌릴 수 없습니다.\n· 의뢰가 붙은 서비스는 삭제되지 않습니다.\n\n정말 삭제하시겠습니까?`}
                        className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-xs text-[var(--muted)] hover:bg-[var(--surface)]"
                      >
                        삭제
                      </ConfirmButton>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* 서비스 없이 만드는 길은 하나만 둠 */}
        <section className="bg-white rounded-[var(--radius-xl)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">문항을 직접 쓰고 싶다면</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              서비스 등록 없이 별점·서술형·보기 선택·이미지 업로드를 섞어 만들 수 있어요.
            </p>
          </div>
          <Link
            href="/dashboard?view=create"
            className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface)] whitespace-nowrap text-center shrink-0"
          >
            직접 만들기
          </Link>
        </section>
      </main>
    </div>
  );
}
