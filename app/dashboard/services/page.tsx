import ClearQueryParams from "@/app/components/ClearQueryParams";
import ConfirmButton from "@/app/components/ConfirmButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import { isConstructActive, type ServiceProfile } from "../../lib/surveyProfile";
import ServiceForm from "./ServiceForm";
import { deleteServiceAction } from "./actions";

export const metadata = { title: "내 서비스" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; deleted?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) redirectToLogin();
  if (me.role !== "DEVELOPER" && me.role !== "ADMIN") redirect("/dashboard");

  const isAdmin = me.role === "ADMIN";
  const { created, deleted } = await searchParams;

  // 관리자는 전체, 그 외는 본인 소유 서비스만
  const [services, constructs] = await Promise.all([
    prisma.service.findMany({
      where: isAdmin ? {} : { ownerId: me.id },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true } },
        _count: { select: { surveys: true } },
        // 동결된 설문이 있으면 목록에서 바로 평가를 만들 수 있게 한다
        surveys: { where: { status: "CONFIRMED" }, orderBy: { round: "desc" }, take: 1, select: { id: true } },
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
        <ClearQueryParams keys={["created", "deleted"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">평가 대상 서비스</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            평가받을 서비스를 등록하고 유형·속성을 지정하면, 그에 맞는 평가 항목이 자동 구성됩니다.
          </p>
        </div>

        {created === "1" && (
          <div className="rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
            서비스가 등록되었습니다.
          </div>
        )}
        {deleted === "1" && (
          <div className="rounded-[var(--radius-md)] bg-gray-50 border border-gray-200 text-gray-600 text-sm px-4 py-2.5">
            서비스가 삭제되었습니다.
          </div>
        )}

        <ServiceForm />

        <section className="space-y-3">
          {services.length === 0 && (
            <p className="text-sm text-[var(--gray-500)] text-center py-10">등록된 서비스가 없습니다.</p>
          )}
          {services.map((s) => {
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
                      {` · 설문 ${s._count.surveys}건`}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        평가 항목 {active.length}개
                      </span>
                      {aiOn && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          AI 모듈
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
                    {s.surveys.length > 0 && (
                      <Link
                        href={`/dashboard?view=create-auto&s=${s.id}`}
                        className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap"
                      >
                        평가 생성
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/services/${s.id}`}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]"
                    >
                      설문 관리
                    </Link>
                    <form action={deleteServiceAction}>
                      <input type="hidden" name="serviceId" value={s.id} />
                      <ConfirmButton
                        message={`「${s.name}」 서비스를 삭제합니다.\n\n· 되돌릴 수 없습니다.\n· 발주가 붙은 서비스는 삭제되지 않습니다.\n\n정말 삭제하시겠습니까?`}
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
      </main>
    </div>
  );
}
