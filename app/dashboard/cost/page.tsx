import SubmitButton from "@/app/components/SubmitButton";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { redirect } from "next/navigation";
import { prisma } from "../../db";
import CostNav from "./CostNav";
import { saveBudget } from "./actions";
import { getCostSetting, BUDGET_KEY } from "./settings";

export const metadata = { title: "비용 관리" };

function won(n: number) {
  return "₩" + n.toLocaleString("ko-KR");
}

export default async function CostDashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const [budget, totalSessions, users, responseCounts, claims] = await Promise.all([
    getCostSetting(BUDGET_KEY, 0),
    prisma.project.count(),
    prisma.user.findMany({
      where: {
        OR: [{ responses: { some: {} } }, { laborClaims: { some: {} } }, { enrollments: { some: {} } }],
      },
      select: { id: true, name: true, studentId: true, major: true },
      orderBy: { studentId: "asc" },
    }),
    prisma.response.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.laborClaim.findMany({
      select: { userId: true, totalAmount: true, status: true },
    }),
  ]);

  const respMap = new Map(responseCounts.map((r) => [r.userId, r._count._all]));
  const claimMap = new Map<string, { sum: number; confirmed: boolean }>();
  for (const c of claims) {
    const prev = claimMap.get(c.userId) || { sum: 0, confirmed: false };
    claimMap.set(c.userId, {
      sum: prev.sum + (c.totalAmount || 0),
      confirmed: prev.confirmed || c.status === "CONFIRMED",
    });
  }

  const spent = claims
    .filter((c) => c.status === "CONFIRMED")
    .reduce((s, c) => s + (c.totalAmount || 0), 0);
  const remain = budget - spent;
  const pct = budget > 0 ? Math.round((spent / budget) * 1000) / 10 : 0;

  const rows = users.map((u) => {
    const responded = respMap.get(u.id) || 0;
    const claim = claimMap.get(u.id);
    const amount = claim?.sum || 0;
    const status = !claim ? "미산정" : claim.confirmed ? "완료" : "대기";
    return { ...u, responded, amount, status };
  });

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <CostNav />

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">비용 관리 대시보드</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            평가자 노무비 예산 현황 및 지급 이력을 관리합니다.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-[var(--radius-xl)] p-5">
            <p className="text-xs text-[var(--muted)]">총 예산</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{won(budget)}</p>
            <form action={saveBudget} className="mt-3 flex gap-2">
              <input
                name="budget"
                type="text"
                inputMode="numeric"
                defaultValue={budget || ""}
                placeholder="예산 입력"
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]"
              />
              <SubmitButton className="px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]">
                저장
              </SubmitButton>
            </form>
          </div>
          <div className="bg-white rounded-[var(--radius-xl)] p-5">
            <p className="text-xs text-[var(--muted)]">집행액 (지급 확정)</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{won(spent)}</p>
            <p className="text-xs text-[var(--muted)] mt-2">
              {budget > 0 ? `전체 예산의 ${pct}% 집행` : "예산을 입력하세요"}
            </p>
          </div>
          <div className="bg-white rounded-[var(--radius-xl)] p-5">
            <p className="text-xs text-[var(--muted)]">잔액</p>
            <p
              className={`text-2xl font-bold mt-1 ${remain < 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}
            >
              {won(remain)}
            </p>
            <p className="text-xs text-[var(--muted)] mt-2">
              {budget > 0 ? `잔여 예산 ${Math.round((100 - pct) * 10) / 10}%` : "—"}
            </p>
          </div>
        </div>

        <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--gray-100)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">평가자별 지급 이력</h3>
            <span className="text-xs text-[var(--muted)]">총 {rows.length}명</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--gray-500)] text-center py-12">평가자 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                    <th className="px-4 py-3 font-semibold">평가자</th>
                    <th className="px-4 py-3 font-semibold">학번/사번</th>
                    <th className="px-4 py-3 font-semibold">참여 횟수</th>
                    <th className="px-4 py-3 font-semibold">산정 금액</th>
                    <th className="px-4 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--gray-100)] hover:bg-[var(--gray-50)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0">
                            {r.name.slice(0, 1)}
                          </span>
                          <div>
                            <p className="font-medium text-[var(--foreground)]">{r.name}</p>
                            <p className="text-xs text-[var(--muted)]">{r.major || "-"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">{r.studentId}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {r.responded} / {totalSessions}회
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{won(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.status === "완료"
                              ? "bg-[var(--success-light)] text-[var(--success)]"
                              : r.status === "대기"
                                ? "bg-[var(--warning-light)] text-[var(--warning)]"
                                : "bg-[var(--gray-100)] text-[var(--gray-500)]"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
