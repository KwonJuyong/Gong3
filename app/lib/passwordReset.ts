import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../db";
import { sendMail, siteUrl, esc } from "./mail";

/**
 * 비밀번호 재설정 토큰 발급·검증·소비(메일 링크 방식).
 *
 * - 원본 토큰은 저장하지 않고 sha256 해시만 남긴다.
 * - 유효기간 30분, 1회용. 사용하면 그 사용자의 남은 토큰도 모두 지운다.
 * - 계정 존재 여부와 무관하게 같은 응답을 준다.
 */

const TTL_MS = 30 * 60 * 1000; // 30분

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * 재설정 링크 발송.
 *
 * @param identifier 로그인 ID(학번·사번·이메일) 또는 가입 이메일
 * @returns 실제 발송 여부. 계정 존재 여부가 드러나므로 화면에 그대로 보여주지 않는다.
 *   발송 설정이 없을 때만 configError 로 알린다.
 */
export async function requestPasswordReset(
  identifier: string,
): Promise<{ sent: boolean; configError?: string }> {
  const key = identifier.trim();
  if (!key) return { sent: false };

  // 이메일은 대소문자를 무시하고 찾는다. 결과와 무관하게 같은 응답을 주므로 못 찾아도 드러나지 않는다.
  const user = await prisma.user.findFirst({
    where: { OR: [{ studentId: key }, { email: { equals: key, mode: "insensitive" } }] },
    select: { id: true, name: true, email: true, studentId: true },
  });

  // 계정이 없어도 호출부는 같은 메시지를 보여준다.
  if (!user?.email) return { sent: false };

  const raw = randomBytes(32).toString("base64url");

  // 새로 요청하면 이전 링크는 무효로 한다.
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  const link = `${siteUrl()}/reset?token=${encodeURIComponent(raw)}`;
  const r = await sendMail({
    to: user.email,
    subject: "[AI 평가단] 비밀번호 재설정",
    html: resetEmailHtml(user.name, user.studentId, link),
  });

  if (!r.ok) {
    // 발송에 실패했으면 토큰도 지운다.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    // 설정 문제(키·발신 도메인)는 사용자에게 알린다.
    return { sent: false, configError: r.error };
  }
  return { sent: true };
}

export type ResetCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** 링크의 토큰이 아직 유효한지. 화면 진입 시와 제출 시 모두 부른다. */
export async function checkResetToken(raw: string): Promise<ResetCheck> {
  const token = (raw || "").trim();
  if (!token) return { ok: false, reason: "invalid" };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { userId: true, expiresAt: true, usedAt: true },
  });

  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.userId };
}

/** 토큰을 소비하고 비밀번호를 바꾼다. 기존 로그인 세션도 모두 끊는다. */
export async function consumeResetToken(raw: string, passwordHash: string): Promise<ResetCheck> {
  const check = await checkResetToken(raw);
  if (!check.ok) return check;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: check.userId },
      data: {
        password: passwordHash,
        // 세션 세대를 올려 기존 세션을 모두 무효화한다.
        sessionEpoch: { increment: 1 },
      },
    }),
    // 사용한 토큰뿐 아니라 그 사용자의 토큰을 모두 지운다.
    prisma.passwordResetToken.deleteMany({ where: { userId: check.userId } }),
  ]);

  return check;
}

function resetEmailHtml(name: string, loginId: string, link: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="font-size:18px;margin:0 0 16px">비밀번호 재설정</h2>
  <p style="font-size:14px;line-height:1.7;margin:0 0 8px">
    ${esc(name)}님, 아래 버튼을 눌러 새 비밀번호를 설정하세요.
  </p>
  <p style="font-size:13px;line-height:1.7;color:#666;margin:0 0 20px">
    로그인 ID: <strong>${esc(loginId)}</strong>
  </p>
  <p style="margin:0 0 20px">
    <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">
      비밀번호 재설정하기
    </a>
  </p>
  <p style="font-size:12px;line-height:1.7;color:#666;margin:0 0 16px;padding:10px 12px;background:#f5f5f5;border-radius:6px;word-break:break-all">
    버튼이 안 눌리거나 <strong>&ldquo;연결을 거부했습니다&rdquo;</strong>가 뜨면, 아래 주소를
    복사해 브라우저 주소창에 직접 붙여넣으세요.<br>
    <span style="color:#1a1a1a">${link}</span>
  </p>
  <p style="font-size:12px;line-height:1.7;color:#888;margin:0 0 4px">
    이 링크는 <strong>30분</strong> 동안만 유효하며 한 번만 사용할 수 있습니다.
  </p>
  <p style="font-size:12px;line-height:1.7;color:#888;margin:0">
    본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.
  </p>
</div>`;
}
