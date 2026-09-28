import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../db";
import { sendMail, siteUrl, esc, isConfigured as mailConfigured } from "./mail";

/**
 * 가입 이메일 인증 토큰 발급·검증·소비.
 *
 * - 원본 토큰은 저장하지 않고 sha256 해시만 남긴다.
 * - 유효기간 24시간, 1회용. 새로 발급하면 이전 토큰은 지운다.
 * - 토큰에 대상 이메일을 함께 저장해, 발급 후 주소가 바뀌면 옛 링크로 인증되지 않게 한다.
 * - 학교 메일 도메인을 권장하지만 강제하지는 않는다.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function isMailReady(): boolean {
  return mailConfigured();
}

/**
 * 인증 메일 발송(재발송 포함). 기존 토큰은 버리고 새로 만든다.
 *
 * @returns 실패하면 사용자에게 보여줄 사유. 성공이면 null.
 */
export async function sendVerificationEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return "사용자를 찾을 수 없습니다.";
  if (user.emailVerifiedAt) return null; // 이미 인증됨
  if (!user.email) return "등록된 이메일이 없습니다. 관리자에게 문의해 주세요.";

  const raw = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  const link = `${siteUrl()}/verify?token=${encodeURIComponent(raw)}`;
  const r = await sendMail({
    to: user.email,
    subject: "[AI 평가단] 이메일 인증",
    html: verifyEmailHtml(user.name, user.email, link),
  });

  if (!r.ok) {
    // 발송에 실패했으면 토큰도 지운다.
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    return r.error ?? "메일 발송에 실패했습니다.";
  }
  return null;
}

export type VerifyResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" | "email-changed" };

/**
 * 링크의 토큰을 소비해 인증을 완료한다.
 *
 * 토큰에 저장한 주소가 현재 User.email 과 같을 때만 인증한다.
 * 링크를 두 번 누르거나 메일 보안 스캐너가 먼저 열어도 성공으로 보이도록,
 * 행을 지우지 않고 usedAt 만 기록한다.
 */
export async function consumeVerificationToken(raw: string): Promise<VerifyResult> {
  const token = (raw || "").trim();
  if (!token) return { ok: false, reason: "invalid" };

  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      userId: true,
      email: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true, emailVerifiedAt: true } },
    },
  });

  if (!row) return { ok: false, reason: "invalid" };
  // 이미 인증된 계정이면 다시 눌러도 성공으로 처리한다.
  if (row.user.emailVerifiedAt) return { ok: true, alreadyDone: true };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.user.email !== row.email) return { ok: false, reason: "email-changed" };

  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    // 행은 남긴다. 다음 발급 때 sendVerificationEmail 이 지우므로 쌓이지 않는다.
    prisma.emailVerificationToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, alreadyDone: false };
}

/**
 * [재발송] 로그인 ID 또는 이메일로 찾아 인증 메일을 다시 보낸다.
 * 계정 존재 여부는 드러내지 않고, 메일 발송 설정이 없는 경우만 알린다.
 */
export async function resendVerification(identifier: string): Promise<{ configError?: string }> {
  if (!mailConfigured()) return { configError: "메일 발송이 설정되지 않았습니다." };

  const key = identifier.trim();
  if (!key) return {};

  // 이메일은 대소문자를 무시하고 찾는다. 결과와 무관하게 같은 응답을 주므로 못 찾아도 드러나지 않는다.
  const user = await prisma.user.findFirst({
    where: { OR: [{ studentId: key }, { email: { equals: key, mode: "insensitive" } }] },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) return {};

  const err = await sendVerificationEmail(user.id);
  // 발송 실패 사유는 설정 문제일 때만 올려보낸다.
  return err && err.includes("설정") ? { configError: err } : {};
}

function verifyEmailHtml(name: string, email: string, link: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h2 style="font-size:18px;margin:0 0 16px">이메일 인증</h2>
  <p style="font-size:14px;line-height:1.7;margin:0 0 8px">
    ${esc(name)}님, AI 평가단 가입을 환영합니다. 아래 버튼을 눌러 이메일 인증을 완료하면
    로그인할 수 있습니다.
  </p>
  <p style="font-size:13px;line-height:1.7;color:#666;margin:0 0 20px">
    인증 대상 주소: <strong>${esc(email)}</strong>
  </p>
  <p style="margin:0 0 20px">
    <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">
      이메일 인증하기
    </a>
  </p>
  <p style="font-size:12px;line-height:1.7;color:#666;margin:0 0 16px;padding:10px 12px;background:#f5f5f5;border-radius:6px;word-break:break-all">
    버튼이 안 눌리거나 <strong>&ldquo;연결을 거부했습니다&rdquo;</strong>가 뜨면, 아래 주소를
    복사해 브라우저 주소창에 직접 붙여넣으세요.<br>
    <span style="color:#1a1a1a">${link}</span>
  </p>
  <p style="font-size:12px;line-height:1.7;color:#888;margin:0 0 4px">
    이 링크는 <strong>24시간</strong> 동안만 유효합니다.
  </p>
  <p style="font-size:12px;line-height:1.7;color:#888;margin:0">
    본인이 가입하지 않았다면 이 메일을 무시하세요. 인증하지 않으면 계정은 활성화되지 않습니다.
  </p>
</div>`;
}
