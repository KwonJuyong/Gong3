import { logPersonalData } from "@/app/lib/accessLog";
import ClearQueryParams from "@/app/components/ClearQueryParams";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import MembersTable, { type MemberRow } from "./MembersTable";

export const metadata = { title: "회원 관리" };

/** 회원 관리(ADMIN). 관리자 전용 화면이라 학번·이메일을 가리지 않는다. */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");
  // 접속기록: 회원 전체의 연락처를 조회하는 화면
  await logPersonalData(me.id, "VIEW", "회원 목록");

  const { ok, error } = await searchParams;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      studentId: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      major: true,
      role: true,
      userType: true,
      status: true,
      withdrawnAt: true,
      createdAt: true,
      // 활동 건수(삭제·탈퇴 판단용)
      _count: {
        select: {
          responses: true,
          surveyResponses: true,
          rewards: true,
          laborClaims: true,
          orders: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: MemberRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    studentId: u.studentId,
    email: u.email ?? "",
    emailVerified: u.emailVerifiedAt != null,
    phone: u.phone ?? "",
    major: u.major ?? "",
    role: u.role,
    userType: u.userType || "STUDENT",
    status: u.status || "ACTIVE",
    withdrawnAt: u.withdrawnAt ? u.withdrawnAt.toISOString() : null,
    responseCount: u._count.responses + u._count.surveyResponses,
    rewardCount: u._count.rewards,
    laborClaimCount: u._count.laborClaims,
    orderCount: u._count.orders,
    createdAt: u.createdAt.toISOString(),
  }));

  const unverified = rows.filter((r) => !r.emailVerified).length;
  const inactive = rows.filter((r) => r.status !== "ACTIVE").length;

  return (
    <div className="min-h-screen bg-[var(--surface)]">


      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-4">
        <ClearQueryParams keys={["ok", "error"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">회원 관리</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            가입한 전체 회원 {rows.length}명
            {unverified > 0 && ` · 이메일 미인증 ${unverified}명`}
            {inactive > 0 && ` · 정지·탈퇴 ${inactive}명`}
          </p>
        </div>
        {ok && (
          <p className="text-sm px-4 py-3 rounded-[var(--radius-md)] text-[var(--success)] bg-[var(--success-light)]">
            {ok}
          </p>
        )}
        {error && (
          <p className="text-sm px-4 py-3 rounded-[var(--radius-md)] text-[var(--danger)] bg-[var(--danger-light)]">
            {error}
          </p>
        )}
        <MembersTable rows={rows} meId={me.id} />
      </main>
    </div>
  );
}
