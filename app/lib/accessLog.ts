import "server-only";
import { headers } from "next/headers";
import { prisma } from "../prisma";

/**
 * 개인정보처리시스템 접속기록(개인정보의 안전성 확보조치 기준 제8조).
 *
 * 인증 이벤트(로그인·로그아웃·비밀번호 변경 등)와 다른 사람의 개인정보를 조회·출력한 경우만
 * 기록함. 관리자의 변경 작업은 AuditLog 에 따로 남음
 *
 * IP 는 clientIp() 로만 얻음. X-Forwarded-For 의 첫 값은 클라이언트가 임의로 넣을 수 있으므로
 * 프록시가 붙인 오른쪽 값을 씀
 * 기록에 실패해도 로그인·다운로드는 막지 않음
 */

/** 앞단 신뢰 프록시 수. CDN 을 하나 더 두면 2 로 올림 */
const TRUSTED_PROXY_HOPS = 1;

export function ipFromHeaders(h: Headers): string {
  const xff = (h.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length > 0) {
    const i = Math.max(0, xff.length - TRUSTED_PROXY_HOPS);
    return xff[i];
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

export type AccessKind =
  | "LOGIN"
  | "LOGIN_FAIL"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET"
  | "LOGOUT_OTHERS"
  | "PERSONAL_DATA";
export type AccessAction = "VIEW" | "EXPORT" | "UPDATE" | "DELETE";

export const KIND_LABEL: Record<string, string> = {
  LOGIN: "로그인",
  LOGIN_FAIL: "로그인 실패",
  LOGOUT: "로그아웃",
  PASSWORD_CHANGE: "비밀번호 변경",
  PASSWORD_RESET: "비밀번호 재설정",
  LOGOUT_OTHERS: "다른 기기 로그아웃",
  PERSONAL_DATA: "개인정보 처리",
  ACCESS_LOG_VIEW: "접속기록 열람",
};
export const ACTION_LABEL: Record<string, string> = { VIEW: "조회", EXPORT: "출력", UPDATE: "변경", DELETE: "삭제" };

/** 없는 계정으로 시도한 입력값은 앞 2글자와 도메인만 남기고 가림 */
export function maskAccount(v: string): string {
  const s = v.trim().slice(0, 120);
  const at = s.indexOf("@");
  if (at < 0) return s.length <= 2 ? "**" : `${s.slice(0, 2)}${"*".repeat(Math.min(6, s.length - 2))}`;
  const local = s.slice(0, at);
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, local.length - 2)))}${s.slice(at)}`;
}

export async function logAccess(e: {
  userId?: string | null;
  account: string;
  kind: AccessKind | "ACCESS_LOG_VIEW";
  action?: AccessAction;
  subjectId?: string | null;
  detail?: string;
  result?: string;
}): Promise<void> {
  try {
    const h = await headers();
    await prisma.accessLog.create({
      data: {
        userId: e.userId ?? null,
        account: e.account.slice(0, 200),
        ip: ipFromHeaders(h),
        userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
        kind: e.kind,
        action: e.action ?? null,
        subjectId: e.subjectId ?? null,
        detail: e.detail?.slice(0, 300) ?? null,
        result: e.result?.slice(0, 200) ?? null,
      },
    });
  } catch (err) {
    console.error("[accessLog] 기록 실패", e.kind, err);
  }
}

/**
 * 개인정보 조회·출력을 기록함. 본인 정보를 본인이 보는 경우(subjectId === userId)는 남기지 않음
 */
export async function logPersonalData(
  userId: string,
  action: AccessAction,
  detail: string,
  subjectId?: string | null,
): Promise<void> {
  if (subjectId && subjectId === userId) return;
  const me = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, studentId: true } })
    .catch(() => null);
  await logAccess({
    userId,
    account: me?.email || me?.studentId || userId,
    kind: "PERSONAL_DATA",
    action,
    subjectId: subjectId ?? null,
    detail,
  });
}

const SEEN_EVERY_MS = 5 * 60 * 1000;

/**
 * 마지막 활동 시각·IP 를 5분에 한 번 기록함(getSessionUserId 가 호출).
 * 실패해도 세션 검증에 영향을 주지 않도록 무시함
 */
export async function touchLastSeen(userId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - SEEN_EVERY_MS);
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
      data: { lastSeenAt: new Date(), lastSeenIp: await clientIp() },
    });
  } catch {
    /* 부가 기능 */
  }
}

/** 보관기간. 고유식별정보를 처리하므로 2년 이상 보관해야 해서 25개월로 둠 */
export const RETENTION_MONTHS = 25;

export async function purgeExpiredAccessLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  const r = await prisma.accessLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}

export type Finding = { key: string; title: string; detail: string; rows: { at: Date; account: string; ip: string; note: string }[] };

/**
 * 월 점검용 이상 징후.
 * 1. 같은 IP 에서 로그인 실패 10회 이상
 * 2. 관리자 계정이 처음 보는 IP 에서 로그인
 * 3. 한 사람이 하루에 개인정보 파일을 5회 이상 출력
 * 4. 0~6시(KST) 개인정보 조회·출력
 */
export async function findAnomalies(from: Date, to: Date): Promise<Finding[]> {
  const logs = await prisma.accessLog.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: "asc" },
  });
  const out: Finding[] = [];

  const failByIp = new Map<string, typeof logs>();
  for (const l of logs) if (l.kind === "LOGIN_FAIL") failByIp.set(l.ip, [...(failByIp.get(l.ip) ?? []), l]);
  const brute = [...failByIp.entries()].filter(([, v]) => v.length >= 10);
  if (brute.length)
    out.push({
      key: "brute",
      title: "같은 IP 에서 로그인 실패 10회 이상",
      detail: "무차별 대입 시도일 수 있습니다. 대상 계정이 한 사람이면 그 사람에게 알리세요.",
      rows: brute.map(([ip, v]) => ({
        at: v[v.length - 1].createdAt,
        account: [...new Set(v.map((x) => x.account))].slice(0, 3).join(", "),
        ip,
        note: `실패 ${v.length}회`,
      })),
    });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const adminIds = new Set(admins.map((a) => a.id));
  const newIpRows: Finding["rows"] = [];
  for (const l of logs) {
    if (l.kind !== "LOGIN" || !l.userId || !adminIds.has(l.userId)) continue;
    const seenBefore = await prisma.accessLog.count({
      where: { userId: l.userId, kind: "LOGIN", ip: l.ip, createdAt: { lt: l.createdAt } },
    });
    if (seenBefore === 0) newIpRows.push({ at: l.createdAt, account: l.account, ip: l.ip, note: "처음 보는 IP" });
  }
  if (newIpRows.length)
    out.push({
      key: "admin-new-ip",
      title: "관리자 계정이 처음 보는 IP 에서 로그인",
      detail: "본인 기기·장소가 맞는지 확인하세요. 아니면 즉시 비밀번호를 바꾸고 다른 기기 로그아웃.",
      rows: newIpRows,
    });

  const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const kstHour = (d: Date) => new Date(d.getTime() + 9 * 3600e3).getUTCHours();
  const exportsByDay = new Map<string, typeof logs>();
  for (const l of logs)
    if (l.kind === "PERSONAL_DATA" && l.action === "EXPORT") {
      const k = `${l.userId}|${kstDay(l.createdAt)}`;
      exportsByDay.set(k, [...(exportsByDay.get(k) ?? []), l]);
    }
  const bulk = [...exportsByDay.values()].filter((v) => v.length >= 5);
  if (bulk.length)
    out.push({
      key: "bulk-export",
      title: "하루 5회 이상 개인정보 파일 출력",
      detail: "정산·신고 마감일이면 정상일 수 있습니다. 사유를 점검 메모에 남기세요.",
      rows: bulk.map((v) => ({ at: v[v.length - 1].createdAt, account: v[0].account, ip: v[0].ip, note: `출력 ${v.length}회` })),
    });

  const night = logs.filter((l) => l.kind === "PERSONAL_DATA" && kstHour(l.createdAt) < 6);
  if (night.length)
    out.push({
      key: "night",
      title: "심야(0~6시) 개인정보 조회·출력",
      detail: "업무 시간 밖 처리입니다. 본인이 한 작업인지 확인하세요.",
      rows: night.map((l) => ({ at: l.createdAt, account: l.account, ip: l.ip, note: l.detail ?? "" })),
    });

  return out;
}

/** "Mozilla/5.0 (Windows NT 10.0…) Chrome/…" → "Windows · Chrome". 화면 표시용 요약. */
export function summarizeUA(ua: string | null | undefined): string {
  if (!ua) return "-";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "기타";
  const br = /Edg\//.test(ua)
    ? "Edge"
    : /Whale\//.test(ua)
      ? "Whale"
      : /SamsungBrowser/.test(ua)
        ? "삼성 인터넷"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "기타";
  return `${os} · ${br}`;
}
