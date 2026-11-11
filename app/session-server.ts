import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
// db.ts 가 이 파일을 import 하므로 순환을 피하려고 ./prisma 에서 가져옴
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

/**
 * 서명·만료·세대를 검증한 세션 사용자 id. 무효면 undefined.
 *
 * API 라우트는 middleware 를 거치지 않으므로 서버 컴포넌트·서버 액션·API 라우트
 * 모두 쿠키를 직접 읽지 말고 이 함수를 씀
 * 무효일 때는 redirect("/") 대신 redirectToLogin() 을 씀
 */
export async function getSessionUserId(): Promise<string | undefined> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySessionValue(raw);
  if (!s) return undefined;

  // 세대(epoch)가 DB 와 다르면 비밀번호 변경·정지 등으로 끊긴 세션임
  // DB 조회가 실패해도 무효로 봄(fail closed).
  const u = await prisma.user
    .findUnique({ where: { id: s.userId }, select: { sessionEpoch: true } })
    .catch(() => null);
  if (!u || u.sessionEpoch !== s.epoch) return undefined;

  // 관리자 「접속 현황」의 최근 활동. 5분에 한 번만 쓰는 조건부 갱신이고 실패해도 통과시킴
  await touchLastSeen(s.userId);

  return s.userId;
}

/**
 * 세션이 무효일 때 로그인 화면으로 보냄
 *
 * middleware 는 서명·만료만 보고 여기서는 DB 세대까지 보므로, 세대만 어긋난 쿠키는
 * middleware 가 /dashboard 로, 페이지가 / 로 서로 돌려보내 무한 루프가 됨
 * 쿠키를 지울 수 있는 라우트 핸들러(/session-expired)를 거쳐 루프를 끊음
 * /session-expired 는 middleware matcher 에 넣으면 안 됨
 *
 * 권한 부족이나 정지 계정처럼 세션 자체는 유효한 경우에는 쓰지 않음
 */
export function redirectToLogin(): never {
  redirect("/session-expired");
}

/**
 * 세션 쿠키를 발급하는 유일한 곳.
 *
 * 수명은 role 로 정해지고 middleware 는 쿠키에 실린 값을 이어받기만 함
 * 그래서 역할이 바뀌면 changeMemberRoleAction 이 세대를 올려 세션을 다시 받게 함
 */
async function issueSession(userId: string, knownEpoch?: number): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionEpoch: true, role: true },
  });
  const ttl = sessionTtlFor(u?.role);
  // 절대 만료는 발급 시점에 한 번만 정함. 갱신 때 다시 계산하면 상한 역할을 못 함
  const abs = absoluteDeadline(sessionAbsoluteTtlFor(u?.role));
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await signSessionValue(userId, knownEpoch ?? u?.sessionEpoch ?? 0, ttl, abs),
    cookieOptionsFor(ttl),
  );
}

/** 로그인 성공 시 세션 발급. */
export async function setSessionCookie(userId: string): Promise<void> {
  await issueSession(userId);
}

/** 로그아웃 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: SESSION_COOKIE, path: "/" });
}

/**
 * 사용자의 모든 세션을 무효화하고 새 세대를 돌려줌
 * 비밀번호 변경·재설정·임시 비밀번호 발급·정지·탈퇴 때 부름
 * 본인이 비밀번호를 바꾼 경우엔 revokeSessionsAndRefresh() 를 씀
 */
export async function revokeSessions(userId: string): Promise<number> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { sessionEpoch: { increment: 1 } },
    select: { sessionEpoch: true },
  });
  return u.sessionEpoch;
}

/** 다른 세션은 끊고 현재 브라우저의 세션만 새로 발급함 */
export async function revokeSessionsAndRefresh(userId: string): Promise<void> {
  const epoch = await revokeSessions(userId);
  // 다시 읽지 않고 방금 올린 값으로 서명함. 그 사이 또 무효화되면 새 쿠키가 곧바로 무효가 됨
  await issueSession(userId, epoch);
}
