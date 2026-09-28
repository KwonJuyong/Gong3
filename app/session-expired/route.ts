import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/app/session";

/**
 * 무효 세션의 쿠키를 지우고 로그인 화면으로 보낸다.
 *
 * 서버 컴포넌트는 렌더 중에 쿠키를 지울 수 없어서, 무효 쿠키를 든 채 / 로 가면
 * middleware 가 다시 /dashboard 로 보내는 루프가 생긴다. 라우트 핸들러에서 지우고 나간다.
 *
 * middleware matcher 에 넣지 않는다. GET 이므로 살아 있는 세션을 끊는 로그아웃 용도로는 쓰지 않는다.
 * ?expired=1 은 로그인 화면이 만료 안내를 띄우는 데 쓴다.
 */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/?expired=1", req.url));
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
