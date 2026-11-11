import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { prisma } from "../../db";
import ConfirmButton from "@/app/components/ConfirmButton";
import ClearQueryParams from "@/app/components/ClearQueryParams";
import {
  ACTION_LABEL,
  KIND_LABEL,
  RETENTION_MONTHS,
  findAnomalies,
  logAccess,
  summarizeUA,
} from "../../lib/accessLog";
import { recordAccessReviewAction } from "./actions";
import { kstMonth, monthRange } from "./month";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "접속 기록" };

/**
 * 접속 현황·접속기록·월 점검(ADMIN). 기록은 app/lib/accessLog.ts 가 남김
 *
 * 위·변조 방지를 위해 수정·삭제 기능은 두지 않음(파기는 월 점검 때 자동).
 * 접속기록도 개인정보이므로 이 화면을 연 것도 기록함
 * 「최근 활동」은 User.lastSeenAt(5분 간격 갱신)을 기준으로 한 추정값임
 */

const PER = 50;
const ACTIVE_MIN = 15;

type Q = {
  tab?: string;
  q?: string;
  kind?: string;
  user?: string;
  ip?: string;
  from?: string;
  to?: string;
  page?: string;
  month?: string;
  done?: string;
  purged?: string;
  error?: string;
};

const fmt = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Seoul" }).format(d)
    : "-";

function ago(d: Date | null | undefined): string {
  if (!d) return "-";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const ROLE_LABEL: Record<string, string> = { ADMIN: "관리자", DEVELOPER: "개설자", USER: "학생 평가자" };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const meId = await getSessionUserId();
  if (!meId) redirectToLogin();
  const me = await prisma.user.findUnique({ where: { id: meId } });
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const tab: "activity" | "log" | "review" = q.tab === "log" || q.tab === "review" ? q.tab : "activity";

  // 접속기록 열람 자체를 남김(필터를 같이 적어 무엇을 봤는지 남김)
  await logAccess({
    userId: me.id,
    account: me.email || me.studentId,
    kind: "ACCESS_LOG_VIEW",
    action: "VIEW",
    subjectId: q.user || null,
    detail: `접속기록 ${tab}${q.q ? ` q=${q.q}` : ""}${q.ip ? ` ip=${q.ip}` : ""}${q.month ? ` ${q.month}` : ""}`,
  });

  const now = new Date();
  const dayStart = new Date(`${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now)}T00:00:00+09:00`);
  const [activeUsers, todayLogin, todayFail, todayPersonal, lastMonthReview] = await Promise.all([
    prisma.user.count({ where: { lastSeenAt: { gte: new Date(now.getTime() - ACTIVE_MIN * 60000) } } }),
    prisma.accessLog.count({ where: { kind: "LOGIN", createdAt: { gte: dayStart } } }),
    prisma.accessLog.count({ where: { kind: "LOGIN_FAIL", createdAt: { gte: dayStart } } }),
    prisma.accessLog.count({ where: { kind: "PERSONAL_DATA", createdAt: { gte: dayStart } } }),
    prisma.accessReview.findUnique({ where: { month: kstMonth(-1) } }),
  ]);

  const tabs = [
    { id: "activity", label: "최근 활동" },
    { id: "log", label: "접속 기록" },
    { id: "review", label: "월 점검", dot: !lastMonthReview },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <ClearQueryParams keys={["done", "purged", "error"]} />
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">접속 기록</h1>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            로그인·로그아웃과 개인정보 조회·출력을 누가, 언제, 어느 IP 에서 했는지 봅니다.
            법정 접속기록이라 <strong>수정·삭제할 수 없고</strong> {RETENTION_MONTHS}개월 보관합니다. 이 화면을 연 것도
            기록됩니다.
          </p>
        </div>

        {q.error && (
          <p role="alert" className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-4 py-3 rounded-[var(--radius-md)]">
            {q.error}
          </p>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: `최근 ${ACTIVE_MIN}분 활동`, value: `${activeUsers}명`, sub: "추정: 5분 단위로 갱신" },
            { label: "오늘 로그인", value: `${todayLogin}회`, sub: "성공" },
            { label: "오늘 로그인 실패", value: `${todayFail}회`, sub: "없는 계정 포함", warn: todayFail >= 20 },
            { label: "오늘 개인정보 처리", value: `${todayPersonal}건`, sub: "남의 정보 조회·출력" },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-[var(--radius-xl)] p-4">
              <p className="text-xs text-[var(--muted)]">{c.label}</p>
              <p className={`text-lg font-bold mt-1 ${c.warn ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>{c.value}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{c.sub}</p>
            </div>
          ))}
        </section>

        <nav aria-label="접속 기록 구역" className="flex gap-1 border-b border-[var(--gray-200)] overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === "activity" ? "/dashboard/access" : `/dashboard/access?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-[var(--accent)] text-[var(--foreground)] font-semibold"
                  : "border-transparent text-[var(--gray-700)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
              {"dot" in t && t.dot && (
                <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-[var(--danger)] align-middle" aria-label="지난달 점검 안 함" />
              )}
            </Link>
          ))}
        </nav>

        {tab === "activity" && <ActivityTab />}
        {tab === "log" && <LogTab q={q} />}
        {tab === "review" && <ReviewTab q={q} />}
      </main>
    </div>
  );
}

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60000);

async function ActivityTab() {
  const since = minutesAgo(24 * 60);
  const users = await prisma.user.findMany({
    where: { lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    select: { id: true, name: true, email: true, studentId: true, role: true, lastSeenAt: true, lastSeenIp: true },
  });
  // 사람마다 마지막 로그인 기기
  const lastLogins = await prisma.accessLog.findMany({
    where: { kind: "LOGIN", userId: { in: users.map((u) => u.id) } },
    orderBy: { createdAt: "desc" },
    distinct: ["userId"],
    select: { userId: true, userAgent: true, createdAt: true, ip: true },
  });
  const loginOf = new Map(lastLogins.map((l) => [l.userId, l]));
  const activeCut = minutesAgo(ACTIVE_MIN).getTime();

  return (
    <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--gray-100)]">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">최근 24시간 동안 활동한 사용자</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          초록 점은 최근 {ACTIVE_MIN}분 안에 요청이 있었던 사람입니다. 로그아웃하지 않고 창을 닫은 경우는 구분되지 않습니다.
        </p>
      </div>
      {users.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-10">최근 24시간 동안 활동한 사용자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] bg-[var(--gray-50)]">
                <th className="px-4 py-2.5 font-medium">사용자</th>
                <th className="px-4 py-2.5 font-medium">역할</th>
                <th className="px-4 py-2.5 font-medium">마지막 활동</th>
                <th className="px-4 py-2.5 font-medium">IP</th>
                <th className="px-4 py-2.5 font-medium">마지막 로그인 기기</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const active = (u.lastSeenAt?.getTime() ?? 0) >= activeCut;
                const login = loginOf.get(u.id);
                return (
                  <tr key={u.id} className="border-t border-[var(--gray-100)]">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-[var(--success)]" : "bg-[var(--gray-300)]"}`}
                          aria-label={active ? "최근 활동" : "비활동"}
                        />
                        <span className="min-w-0">
                          <span className="block text-[var(--foreground)] font-medium">{u.name}</span>
                          <span className="block text-xs text-[var(--muted)]">{u.email || u.studentId}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--gray-700)] whitespace-nowrap">{ROLE_LABEL[u.role] ?? u.role}</td>
                    <td className="px-4 py-2.5 text-[var(--gray-700)] whitespace-nowrap" title={fmt(u.lastSeenAt)}>
                      {ago(u.lastSeenAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {u.lastSeenIp ? (
                        <Link href={`/dashboard/access?tab=log&ip=${encodeURIComponent(u.lastSeenIp)}`} className="underline text-[var(--gray-700)]">
                          {u.lastSeenIp}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--gray-700)] whitespace-nowrap">
                      {login ? `${summarizeUA(login.userAgent)} · ${ago(login.createdAt)}` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Link href={`/dashboard/access?tab=log&user=${u.id}`} className="text-sm text-[var(--gray-700)] underline">
                        기록 보기
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

async function LogTab({ q }: { q: Q }) {
  const page = Math.max(1, parseInt(q.page || "1", 10) || 1);
  const where: Prisma.AccessLogWhereInput = {};
  if (q.kind) where.kind = q.kind;
  if (q.user) where.userId = q.user;
  if (q.ip) where.ip = q.ip;
  if (q.q) where.OR = [{ account: { contains: q.q, mode: "insensitive" } }, { ip: { contains: q.q } }, { detail: { contains: q.q, mode: "insensitive" } }];
  const created: Prisma.DateTimeFilter = {};
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) created.gte = new Date(`${q.from}T00:00:00+09:00`);
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) created.lt = new Date(new Date(`${q.to}T00:00:00+09:00`).getTime() + 86400e3);
  if (created.gte || created.lt) where.createdAt = created;

  const [total, rows] = await Promise.all([
    prisma.accessLog.count({ where }),
    prisma.accessLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
  ]);
  // 대상(정보주체) 이름: 이 페이지 행에 나온 것만
  const subjectIds = [...new Set(rows.map((r) => r.subjectId).filter((v): v is string => !!v))];
  const subjects = subjectIds.length
    ? await prisma.user.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(subjects.map((s) => [s.id, s.name]));
  const filterUser = q.user ? await prisma.user.findUnique({ where: { id: q.user }, select: { name: true } }) : null;

  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (patch: Partial<Q>) => {
    const p = new URLSearchParams();
    const merged = { ...q, tab: "log", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !["done", "purged", "error", "month"].includes(k)) p.set(k, String(v));
    return `/dashboard/access?${p.toString()}`;
  };
  const input =
    "px-3 py-2 text-sm bg-white border border-[var(--gray-300)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <section className="space-y-4">
      <form method="get" action="/dashboard/access" className="bg-white rounded-[var(--radius-xl)] p-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="log" />
        {q.user && <input type="hidden" name="user" value={q.user} />}
        <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-xs text-[var(--gray-700)]">계정·IP·내용 검색</span>
          <input name="q" defaultValue={q.q ?? ""} placeholder="예) 203.0.113 또는 @hallym.ac.kr" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--gray-700)]">종류</span>
          <select name="kind" defaultValue={q.kind ?? ""} className={input}>
            <option value="">전체</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--gray-700)]">시작일</span>
          <input type="date" name="from" defaultValue={q.from ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--gray-700)]">종료일</span>
          <input type="date" name="to" defaultValue={q.to ?? ""} className={input} />
        </label>
        {q.ip && <input type="hidden" name="ip" value={q.ip} />}
        <button className="px-4 py-2 text-sm font-semibold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]">
          찾기
        </button>
        {(q.q || q.kind || q.from || q.to || q.user || q.ip) && (
          <Link href="/dashboard/access?tab=log" className="px-3 py-2 text-sm text-[var(--gray-700)] underline">
            조건 지우기
          </Link>
        )}
      </form>

      {(filterUser || q.ip) && (
        <p className="text-sm text-[var(--gray-700)]">
          {filterUser && (
            <>
              <strong>{filterUser.name}</strong> 님의 기록만 보는 중 ·{" "}
            </>
          )}
          {q.ip && (
            <>
              IP <strong className="font-mono">{q.ip}</strong> 의 기록만 보는 중 ·{" "}
            </>
          )}
          <Link href={qs({ user: undefined, ip: undefined, page: undefined })} className="underline">
            전체 보기
          </Link>
        </p>
      )}

      <div className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--gray-100)] text-sm text-[var(--gray-700)]">
          {total.toLocaleString("ko-KR")}건 · {page}/{pages}쪽
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-10">조건에 맞는 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)] bg-[var(--gray-50)]">
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">시각</th>
                  <th className="px-4 py-2.5 font-medium">계정</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                  <th className="px-4 py-2.5 font-medium">종류</th>
                  <th className="px-4 py-2.5 font-medium">대상 · 내용</th>
                  <th className="px-4 py-2.5 font-medium">기기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const fail = r.kind === "LOGIN_FAIL";
                  return (
                    <tr key={r.id} className="border-t border-[var(--gray-100)] align-top">
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--gray-700)] tabular-nums">{fmt(r.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        {r.userId ? (
                          <Link href={qs({ user: r.userId, page: undefined })} className="underline text-[var(--foreground)] break-all">
                            {r.account}
                          </Link>
                        ) : (
                          <span className="text-[var(--gray-700)] break-all">{r.account}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                        <Link href={qs({ ip: r.ip, page: undefined })} className="underline text-[var(--gray-700)]">
                          {r.ip}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={fail ? "text-[var(--danger)] font-medium" : "text-[var(--foreground)]"}>
                          {KIND_LABEL[r.kind] ?? r.kind}
                        </span>
                        {r.action && <span className="text-xs text-[var(--muted)]"> · {ACTION_LABEL[r.action] ?? r.action}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--gray-700)]">
                        {r.subjectId && <span className="font-medium text-[var(--foreground)]">{nameOf.get(r.subjectId) ?? "(삭제된 회원)"} · </span>}
                        {r.detail}
                        {r.result && <span className="text-xs text-[var(--muted)]"> ({r.result})</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-[var(--gray-700)]">{summarizeUA(r.userAgent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--gray-100)] text-sm">
            {page > 1 ? (
              <Link href={qs({ page: String(page - 1) })} className="underline text-[var(--gray-700)]">
                ← 이전
              </Link>
            ) : (
              <span />
            )}
            {page < pages && (
              <Link href={qs({ page: String(page + 1) })} className="underline text-[var(--gray-700)]">
                다음 →
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

async function ReviewTab({ q }: { q: Q }) {
  // 기본은 지난달(끝난 달을 점검함)
  const month = q.month && monthRange(q.month) ? q.month : kstMonth(-1);
  const range = monthRange(month)!;
  const [findings, review, recent] = await Promise.all([
    findAnomalies(range.from, range.to),
    prisma.accessReview.findUnique({ where: { month } }),
    prisma.accessReview.findMany({ orderBy: { month: "desc" }, take: 12 }),
  ]);
  const reviewer = review ? await prisma.user.findUnique({ where: { id: review.reviewerId }, select: { name: true } }) : null;
  const months = [0, -1, -2, -3, -4, -5].map((o) => kstMonth(o));
  const findingCount = findings.reduce((n, f) => n + f.rows.length, 0);

  return (
    <section className="space-y-4">
      {q.done && (
        <p role="status" className="text-sm text-[var(--success)] bg-[var(--success-light)] px-4 py-3 rounded-[var(--radius-md)]">
          {month} 점검을 기록했습니다.
          {Number(q.purged) > 0 && ` 보관기간(${RETENTION_MONTHS}개월)이 지난 기록 ${q.purged}건을 파기했습니다.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--gray-700)]">점검 월</span>
        {months.map((m) => (
          <Link
            key={m}
            href={`/dashboard/access?tab=review&month=${m}`}
            aria-current={m === month ? "page" : undefined}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] border ${
              m === month
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--gray-300)] text-[var(--gray-700)] hover:bg-[var(--gray-50)]"
            }`}
          >
            {m}
            {recent.some((r) => r.month === m) && " ✓"}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-[var(--radius-xl)] p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          {month} 이상 징후 <span className="text-[var(--muted)] font-normal">{findingCount}건</span>
        </h2>
        <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
          자동으로 추린 항목입니다. 판정 기준: 같은 IP 로그인 실패 10회 이상 · 관리자 계정의 처음 보는 IP 로그인 ·
          하루 5회 이상 개인정보 파일 출력 · 0~6시 개인정보 조회·출력. 없다고 해서 이상이 없다는 뜻은 아닙니다. 「접속 기록」 탭에서 직접 훑어보세요.
        </p>

        {findings.length === 0 ? (
          <p className="text-sm text-[var(--gray-700)] mt-4">자동 기준에 걸린 항목이 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {findings.map((f) => (
              <div key={f.key} className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] overflow-hidden">
                <div className="px-4 py-3 bg-[var(--warning-light)]">
                  <p className="text-sm font-semibold text-[var(--gray-800)]">
                    {f.title} <span className="font-normal">({f.rows.length})</span>
                  </p>
                  <p className="text-xs text-[var(--gray-700)] mt-0.5">{f.detail}</p>
                </div>
                <ul className="divide-y divide-[var(--gray-100)]">
                  {f.rows.slice(0, 20).map((r, i) => (
                    <li key={i} className="px-4 py-2 text-sm flex flex-wrap gap-x-4 gap-y-0.5">
                      <span className="text-[var(--gray-700)] tabular-nums">{fmt(r.at)}</span>
                      <span className="text-[var(--foreground)] break-all">{r.account}</span>
                      <Link href={`/dashboard/access?tab=log&ip=${encodeURIComponent(r.ip)}`} className="font-mono text-xs underline text-[var(--gray-700)]">
                        {r.ip}
                      </Link>
                      <span className="text-[var(--muted)]">{r.note}</span>
                    </li>
                  ))}
                  {f.rows.length > 20 && <li className="px-4 py-2 text-xs text-[var(--muted)]">외 {f.rows.length - 20}건</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-[var(--radius-xl)] p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">점검 기록</h2>
        {review ? (
          <p className="text-sm text-[var(--gray-700)] mt-2 leading-relaxed">
            <strong className="text-[var(--success)]">점검 완료</strong> — {fmt(review.createdAt)} · {reviewer?.name ?? "관리자"} ·
            당시 이상 징후 {review.findings}건
            {review.note && (
              <>
                <br />
                <span className="text-[var(--foreground)]">메모: {review.note}</span>
              </>
            )}
          </p>
        ) : (
          <form action={recordAccessReviewAction} className="mt-3 space-y-3">
            <input type="hidden" name="month" value={month} />
            <label className="block">
              <span className="block text-xs font-medium text-[var(--gray-700)] mb-1">점검 메모 (이상 징후가 있으면 확인 결과를 적으세요)</span>
              <textarea
                name="note"
                rows={3}
                placeholder="예) 9/14 심야 출력 3건: 원천세 신고 마감 작업, 본인 확인함"
                className="w-full px-3 py-2 text-sm bg-white border border-[var(--gray-300)] rounded-[var(--radius-md)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            </label>
            <div className="flex justify-end">
              <ConfirmButton
                message={`${month} 접속기록 점검을 완료로 기록합니다.\n\n· 점검자·시각·메모와 당시 이상 징후 ${findingCount}건이 남고, 고칠 수 없습니다.\n· 보관기간(${RETENTION_MONTHS}개월)이 지난 접속기록은 이때 함께 파기됩니다.\n\n정말 기록하시겠습니까?`}
                confirmLabel="점검 완료 기록"
                pendingText="기록 중…"
                className="px-4 py-2.5 text-sm font-semibold bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]"
              >
                {month} 점검 완료 기록
              </ConfirmButton>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
