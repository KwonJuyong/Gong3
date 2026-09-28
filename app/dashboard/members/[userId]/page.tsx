import { logPersonalData } from "@/app/lib/accessLog";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { won } from "../../../lib/money";
import { formatPhone } from "../../../components/PhoneInput";

export const metadata = { title: "회원 활동 내역" };

/**
 * 회원 활동 내역(ADMIN) — /dashboard/members/<userId>
 *
 * 신청·응답·보상·노무비·발주·관리자 조작을 { at, kind, title, detail } 로 맞춰 시간순 한 줄로 보여준다.
 * 응답 내용과 주민번호·계좌는 싣지 않는다(각각 리포트와 정산 화면에서 본다).
 */

type Kind = "ENROLL" | "RESPONSE" | "REWARD" | "LABOR" | "ORDER" | "ADMIN";

interface Item {
  at: Date;
  kind: Kind;
  title: string;
  detail?: string;
  href?: string;
}

const KIND_META: Record<Kind, { label: string; cls: string }> = {
  ENROLL: { label: "평가 신청", cls: "bg-[var(--gray-100)] text-[var(--gray-600)]" },
  RESPONSE: { label: "응답 제출", cls: "bg-[var(--accent-light)] text-[var(--accent)]" },
  REWARD: { label: "보상", cls: "bg-[var(--success-light)] text-[var(--success)]" },
  LABOR: { label: "노무비", cls: "bg-[var(--warning-light)] text-[var(--warning)]" },
  ORDER: { label: "발주", cls: "bg-[var(--accent-light)] text-[var(--accent)]" },
  ADMIN: { label: "관리자 조작", cls: "bg-[var(--danger-light)] text-[var(--danger)]" },
};

const REWARD_STATUS: Record<string, string> = {
  PENDING: "검수 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  PAID: "지급 완료",
};

const seoul = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(d);

const seoulDate = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(d);

export default async function MemberActivityPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const meId = await getSessionUserId();
  if (!meId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: meId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const { userId } = await params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) notFound();
  await logPersonalData(me.id, "VIEW", "회원 활동 내역", user.id);

  // 병렬로 조회하고 종류마다 최근 100건까지만 가져온다.
  const TAKE = 100;
  const [enrollments, responses, surveyResponses, rewards, laborClaims, orders, audits] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        select: { createdAt: true, status: true, project: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      prisma.response.findMany({
        where: { userId },
        select: { createdAt: true, project: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      prisma.surveyResponse.findMany({
        where: { userId },
        select: {
          createdAt: true,
          submittedAt: true,
          surveyVersion: { select: { round: true, service: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      prisma.reward.findMany({
        where: { userId },
        select: {
          createdAt: true,
          status: true,
          grossAmount: true,
          netAmount: true,
          taxAmount: true,
          order: { select: { id: true, orderNo: true } },
        },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      prisma.laborClaim.findMany({
        where: { userId },
        select: {
          createdAt: true,
          status: true,
          totalAmount: true,
          batch: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      prisma.order.findMany({
        where: { buyerId: userId },
        select: {
          id: true,
          createdAt: true,
          orderNo: true,
          status: true,
          totalAmount: true,
          service: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
      // 관리자 조작 이력
      prisma.auditLog.findMany({
        where: { targetId: userId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
      }),
    ]);

  // 조작한 관리자의 이름을 한 번에 채운다(N+1 방지). AuditLog 는 관계가 없어 id 만 갖고 있다.
  const actorIds = [...new Set(audits.map((a) => a.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const items: Item[] = [
    ...enrollments.map((e) => ({
      at: e.createdAt,
      kind: "ENROLL" as const,
      title: e.project.title,
      detail:
        e.status === "ACCEPTED"
          ? "선발"
          : e.status === "REJECTED"
            ? "비선발"
            : e.status === "REMOVED"
              ? "관리자 제외"
              : "검토 대기",
    })),
    ...responses.map((r) => ({
      at: r.createdAt,
      kind: "RESPONSE" as const,
      title: r.project.title,
    })),
    // 이전 방식(SurveyVersion 직접 응답)의 응답도 함께 보여준다.
    ...surveyResponses.map((s) => ({
      at: s.createdAt,
      kind: "RESPONSE" as const,
      title: `${s.surveyVersion.service.name} · 회차 ${s.surveyVersion.round}`,
      detail: s.submittedAt ? "제출 완료 (설문 직접 응답)" : "작성 중 (설문 직접 응답)",
    })),
    ...rewards.map((r) => ({
      at: r.createdAt,
      kind: "REWARD" as const,
      title: `${r.order.orderNo} · ${won(r.netAmount)} 수령`,
      detail: `${REWARD_STATUS[r.status] ?? r.status} · 세전 ${won(r.grossAmount)} · 원천징수 ${won(r.taxAmount)}`,
      href: `/dashboard/orders/${r.order.id}`,
    })),
    ...laborClaims.map((c) => ({
      at: c.createdAt,
      kind: "LABOR" as const,
      title: `${c.batch.title} · ${won(c.totalAmount)}`,
      detail: c.status === "CONFIRMED" ? "확정" : "작성 중",
    })),
    ...orders.map((o) => ({
      at: o.createdAt,
      kind: "ORDER" as const,
      title: `${o.orderNo} · ${o.service.name}`,
      detail: `${o.status} · ${won(o.totalAmount)}`,
      href: `/dashboard/orders/${o.id}`,
    })),
    ...audits.map((a) => ({
      at: a.createdAt,
      kind: "ADMIN" as const,
      title: a.summary,
      detail: `조작: ${actorName.get(a.actorId) ?? "알 수 없음"}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const totalNet = rewards
    .filter((r) => r.status === "PAID")
    .reduce((s, r) => s + r.netAmount, 0);

  const statusLabel =
    user.status === "WITHDRAWN" ? "탈퇴" : user.status === "SUSPENDED" ? "정지" : "정상";

  return (
    <div className="min-h-screen bg-[var(--surface)]">


      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link href="/dashboard/members" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4">
          ← 회원 관리
        </Link>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--foreground)]">{user.name}</h1>
            {user.status !== "ACTIVE" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--danger)] text-white">
                {statusLabel}
              </span>
            )}
            {!user.emailVerifiedAt && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--warning)] text-white">
                이메일 미인증
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--muted)] mt-1">
            {user.studentId}
            {user.major ? ` · ${user.major}` : ""} · 가입 {seoulDate(user.createdAt)}
          </p>
        </div>
        {/* 요약: 건수와 금액 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "평가 신청", value: `${enrollments.length}건` },
            {
              label: "응답 제출",
              value: `${responses.length + surveyResponses.length}건`,
            },
            { label: "보상", value: `${rewards.length}건` },
            { label: "지급 완료액", value: won(totalNet) },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-[var(--radius-lg)] px-4 py-3"
            >
              <p className="text-xs text-[var(--muted)]">{s.label}</p>
              <p className="text-base font-bold text-[var(--gray-900)] mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {/* 연락처(정산 정보는 두지 않는다) */}
        <div className="bg-white rounded-[var(--radius-lg)] px-5 py-4">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted)]">이메일</dt>
              <dd className="text-[var(--gray-900)] break-all">{user.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">연락처</dt>
              <dd className="text-[var(--gray-900)]">{formatPhone(user.phone || "") || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">역할 / 유형</dt>
              <dd className="text-[var(--gray-900)]">
                {user.role} / {user.userType}
              </dd>
            </div>
          </dl>
        </div>

        <section>
          <h3 className="text-sm font-bold text-[var(--gray-900)] mb-3">
            활동 내역 {items.length > 0 && `(${items.length}건)`}
          </h3>

          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)] bg-white rounded-[var(--radius-lg)] px-5 py-8 text-center">
              아직 활동 내역이 없습니다.
            </p>
          ) : (
            <ol className="bg-white rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)]">
              {items.map((it, i) => {
                const meta = KIND_META[it.kind];
                const body = (
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <span
                      className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-[var(--radius-sm)] ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--gray-900)] break-words">{it.title}</p>
                      {it.detail && (
                        <p className="text-xs text-[var(--muted)] mt-0.5 break-words">
                          {it.detail}
                        </p>
                      )}
                    </div>
                    <time className="shrink-0 text-xs text-[var(--gray-500)] tabular-nums">
                      {seoul(it.at)}
                    </time>
                  </div>
                );
                return (
                  <li key={i}>
                    {it.href ? (
                      <Link href={it.href} className="block hover:bg-[var(--gray-50)]">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <p className="text-xs text-[var(--gray-500)] mt-3 leading-relaxed">
            각 항목은 최근 {TAKE}건까지 표시합니다. 응답 원문은 평가 리포트 화면에서 봅니다 —
            이 화면은 &ldquo;언제 무엇을 했나&rdquo;만 다룹니다.
          </p>
        </section>
      </main>
    </div>
  );
}
