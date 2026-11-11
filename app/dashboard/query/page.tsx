import { redirect } from "next/navigation";
import { prisma } from "../../db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import QueryConsole from "./QueryConsole";

export const metadata = { title: "데이터 조회" };

/**
 * 데이터 조회 화면. 로그인만 확인하고, 볼 수 있는 범위는 queryPolicy 가 역할별로 정함
 */
export default async function QueryPage() {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!me || me.status !== "ACTIVE") redirect("/");

  return <QueryConsole />;
}
