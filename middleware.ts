import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  absoluteDeadline,
  absoluteTtlForTtl,
  cookieOptionsFor,
  safeNext,
  signSessionValue,
  verifySessionValue,
  type SessionPayload,
} from "@/app/session";

// 슬라이딩 갱신: 보호 경로에 접속할 때마다 유휴 만료를 뒤로 미룸
// Edge 에서는 DB 를 볼 수 없으므로 epoch·ttl 은 쿠키 값을 그대로 쓰고,
// 절대 만료(abs)도 이어받기만 함. 여기서 다시 계산하면 상한이 사라짐
async function refreshSession(res: NextResponse, s: SessionPayload) {
  const abs = s.abs ?? absoluteDeadline(absoluteTtlForTtl(s.ttl));
  // 쿠키 maxAge 는 유휴·절대 만료 중 먼저 오는 쪽에 맞춤
  const remaining = Math.max(1, abs - Math.floor(Date.now() / 1000));
  res.cookies.set(
    SESSION_COOKIE,
    await signSessionValue(s.userId, s.epoch, s.ttl, abs),
    cookieOptionsFor(Math.min(s.ttl, remaining)),
  );
  return res;
}

/**
 * 화면 이동(로그인 화면으로 보내기·세션 갱신)만 담당함
 * API 라우트는 matcher 밖이고, 여기서는 서명·만료만 보므로 무효화된 세션도 통과함
 * 인증은 각 진입점이 getSessionUserId() 로 함
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 점검 모드: 정적 파일과 점검 페이지 자체는 통과
  if (
    process.env.MAINTENANCE_MODE === "true" &&
    pathname !== "/maintenance" &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !pathname.match(/\.(ico|svg|png|jpg)$/)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    return NextResponse.rewrite(url);
  }

  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionValue(raw);

  // public/uploads 는 정적 서빙이라 API 라우트를 거치지 않으므로 여기서 로그인 여부를 봄
  // 파일 존재를 드러내지 않도록 리다이렉트 대신 404. 소유자 판정은 하지 않음
  // 로그인 상태면 정적 서빙 대신 /api/uploads 로 넘겨 확장자 허용 목록·MIME·다운로드 강제를 적용함
  if (pathname.startsWith("/uploads/")) {
    if (!session) return new NextResponse(null, { status: 404 });
    const url = req.nextUrl.clone();
    url.pathname = "/api" + pathname;
    return refreshSession(NextResponse.rewrite(url), session);
  }

  // 검증에 실패한 쿠키는 지움
  const dropBadCookie = (res: NextResponse) => {
    if (raw && !session) res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
    return res;
  };

  // 로그인 상태로 로그인 페이지에 오면 원래 가려던 곳(없으면 대시보드)으로
  if (pathname === "/" && session) {
    const dest = safeNext(req.nextUrl.searchParams.get("next"));
    return refreshSession(NextResponse.redirect(new URL(dest, req.url)), session);
  }

  // 미인증 상태로 보호 경로에 오면 로그인 페이지로. 원래 경로는 next로 넘겨
  // 로그인 후 그 화면으로 복귀시킴(알림·딥링크로 진입했다 만료된 경우).
  if (pathname.startsWith("/dashboard") && !session) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", pathname + search);
    return dropBadCookie(NextResponse.redirect(url));
  }

  if (session) return refreshSession(NextResponse.next(), session);
  return dropBadCookie(NextResponse.next());
}

export const config = {
  // /reset·/verify·/email-setup·/claim 은 인증 없이 여는 경로임. 점검 모드를 적용하려고 넣었음
  // /session-expired 는 넣지 않음. 쿠키를 지우기 전에 /dashboard 로 튕겨 무한 루프가 됨
  matcher: [
    "/",
    "/dashboard/:path*",
    "/maintenance",
    "/reset",
    "/verify",
    "/email-setup",
    "/claim/:path*",
    // 위의 uploads 로그인 검사는 이 줄이 있어야 실행됨
    "/uploads/:path*",
  ],
};
