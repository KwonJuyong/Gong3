"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcrypt";
import { prisma, ActionState } from "../db";
import { setSessionCookie } from "../session-server";
import { checkRateLimit } from "../rate-limit";
import { consumeClaimToken, lookupClaimToken } from "../lib/accountClaim";
import { clientIp, logAccess } from "../lib/accessLog";

// IP 는 clientIp()(lib/accessLog.ts)로 얻는다.
const getClientIP = clientIp;

/**
 * [계정 인계] 링크를 받은 사람이 로그인용 이메일과 비밀번호를 정한다.
 *
 * 본인 확인은 관리자가 보낸 토큰으로 하므로 학번이나 기존 비밀번호는 묻지 않는다.
 * 링크가 이미 사람을 특정하므로 이메일 인증 메일은 보내지 않고 emailVerifiedAt 을 채운다.
 * 대신 오타를 막으려고 주소를 두 번 입력받는다. 끝나면 바로 로그인시킨다.
 */
export async function claimAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await getClientIP();
  const rlMsg = checkRateLimit(`claim:${ip}`, 10, 15 * 60 * 1000);
  if (rlMsg) return { error: rlMsg, success: false };

  const token = ((formData.get("token") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const confirm = ((formData.get("emailConfirm") as string) || "").trim();
  const password = (formData.get("password") as string) || "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) || "";

  if (!token) return { error: "잘못된 접근입니다. 받으신 링크로 다시 들어와 주세요.", success: false };

  const found = await lookupClaimToken(token);
  if (!found.ok) {
    // 폼을 연 사이 만료됐거나 다른 탭에서 먼저 끝낸 경우
    return {
      error: "링크가 만료되었거나 이미 사용되었습니다. 관리자에게 재발급을 요청해 주세요.",
      success: false,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "이메일 형식이 올바르지 않습니다.", success: false };
  }
  if (email.toLowerCase() !== confirm.toLowerCase()) {
    return { error: "두 이메일이 서로 다릅니다. 다시 확인해 주세요.", success: false };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상이어야 합니다.", success: false };
  }
  if (password !== passwordConfirm) {
    return { error: "두 비밀번호가 서로 다릅니다.", success: false };
  }
  // 학번과 같은 비밀번호는 쓰지 못하게 한다.
  if (password.trim() === found.studentId) {
    return { error: "학번과 같은 비밀번호는 쓸 수 없습니다. 다른 값으로 정해 주세요.", success: false };
  }

  // 이메일 중복은 대소문자를 무시하고 확인한다(registerAction 과 같은 규칙).
  const taken = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, id: { not: found.userId } },
    select: { id: true },
  });
  if (taken) {
    return { error: "이미 다른 계정이 사용 중인 이메일입니다.", success: false };
  }

  // 동시 제출 중 하나만 통과하도록 토큰을 먼저 소비한다(조건부 updateMany).
  if (!(await consumeClaimToken(token))) {
    return { error: "이미 사용된 링크입니다.", success: false };
  }

  try {
    await prisma.user.update({
      where: { id: found.userId },
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        // 링크로 본인을 확인했으므로 인증 완료로 둔다.
        emailVerifiedAt: new Date(),
        // 기존 세션을 모두 끊는다(임시 비밀번호 발급과 같은 처리).
        sessionEpoch: { increment: 1 },
      },
    });
    // 이전 재설정 링크도 무효화한다.
    await prisma.passwordResetToken.deleteMany({ where: { userId: found.userId } });
  } catch {
    return { error: "저장 중 오류가 발생했습니다. 다시 시도해 주세요.", success: false };
  }

  await setSessionCookie(found.userId);
  {
    const u = await prisma.user.findUnique({ where: { id: found.userId }, select: { email: true, studentId: true } });
    await logAccess({ userId: found.userId, account: u?.email || u?.studentId || found.userId, kind: "LOGIN", result: "계정 인계 링크" });
  }
  redirect("/dashboard");
}
