import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
// db.ts와 순환 참조를 피하기 위해 ./prisma 직접 참조
import { prisma } from "./prisma";
import { touchLastSeen } from "./lib/accessLog";
import {
  SESSION_COOKIE,
  absoluteDeadline,
  cookieOptionsFor,
  sessionAbsoluteTtlFor,
  sessionTtlFor,
  signSessionValue,
  verifySessionValue,
} from "./session";

export async function getSessionUserId(): Promise<string | undefined> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySessionValue(raw);
  if (!s) return undefined;

  const u = await prisma.user
    .findUnique({ where: { id: s.userId }, select: { sessionEpoch: true } })
    .catch(() => null);
  if (!u || u.sessionEpoch !== s.epoch) return undefined;

  await touchLastSeen(s.userId);
  return s.userId;
}

// 세대 불일치 쿠키의 무한 리다이렉트를 막기 위해 쿠키 삭제 라우트(/session-expired) 경유
export function redirectToLogin(next?: string): never {
  redirect(next ? `/session-expired?next=${encodeURIComponent(next)}` : "/session-expired");
}

async function issueSession(userId: string, knownEpoch?: number): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionEpoch: true, role: true },
  });
  const ttl = sessionTtlFor(u?.role);
  const abs = absoluteDeadline(sessionAbsoluteTtlFor(u?.role));
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await signSessionValue(userId, knownEpoch ?? u?.sessionEpoch ?? 0, ttl, abs),
    cookieOptionsFor(ttl),
  );
}

export async function setSessionCookie(userId: string): Promise<void> {
  await issueSession(userId);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE, path: "/" });
}

export async function revokeSessions(userId: string): Promise<number> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { sessionEpoch: { increment: 1 } },
    select: { sessionEpoch: true },
  });
  return u.sessionEpoch;
}

export async function revokeSessionsAndRefresh(userId: string): Promise<void> {
  const epoch = await revokeSessions(userId);
  await issueSession(userId, epoch);
}
