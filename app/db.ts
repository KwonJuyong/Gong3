import "server-only";
import { prisma } from "@/app/prisma";
import { getSessionUserId } from "@/app/session-server";

// 싱글톤은 순환 import 를 피하려고 app/prisma.ts 에 두고 여기서는 재export 함
export { prisma };

export type ActionState = { error: string | null; success: boolean } | null;

/** 쿠키에서 user_id를 읽어 DB에서 User를 반환. 인증 안 된 경우 null. */
export async function getSessionUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
