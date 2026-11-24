import { NextResponse } from "next/server";
import { SESSION_COOKIE, safeNext } from "@/app/session";

/**
 * 무효 세션의 쿠키를 지우고 로그인 화면으로 보냄
 *
 * 서버 컴포넌트는 렌더 중에 쿠키를 지울 수 없어서, 무효 쿠키를 든 채 / 로 가면
 * proxy 가 다시 /dashboard 로 보내는 루프가 생김. 라우트 핸들러에서 지우고 나감
 *
 * proxy matcher 에 넣지 않음. GET 이므로 살아 있는 세션을 끊는 로그아웃 용도로는 쓰지 않음
 * ?expired=1 은 로그인 화면이 만료 안내를 띄우는 데 씀
 * ?next= 로 돌아갈 화면을 받으면 로그인 후 그 화면으로 이어지게 넘김(응답 제출 중 만료 등)
 * Location 은 상대 경로(프록시 뒤에서 req.url 의 호스트가 localhost:3000 이라 절대 주소 사용 불가)
 */
export async function GET(req: Request) {
  const params = new URLSearchParams({ expired: "1" });
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  if (next !== "/dashboard") params.set("next", next);
  const res = new NextResponse(null, { status: 307, headers: { Location: `/?${params}` } });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
