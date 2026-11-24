import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../db";
import { sendMail, siteUrl, esc, isConfigured as mailConfigured } from "./mail";

const TTL_MS = 24 * 60 * 60 * 1000;
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function isMailReady(): boolean {
  return mailConfigured();
}

export async function sendVerificationEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return "사용자를 찾을 수 없습니다.";
  if (user.emailVerifiedAt) return null;
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
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash: hash(raw) } });
    return r.error ?? "메일 발송에 실패했습니다.";
  }
  return null;
}

export type VerifyResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" | "email-changed" };

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
  if (row.user.emailVerifiedAt) return { ok: true, alreadyDone: true };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.user.email !== row.email) return { ok: false, reason: "email-changed" };

  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, alreadyDone: false };
}

export async function resendVerification(identifier: string): Promise<{ configError?: string }> {
  if (!mailConfigured()) return { configError: "메일 발송이 설정되지 않았습니다." };

  const key = identifier.trim();
  if (!key) return {};

  const user = await prisma.user.findFirst({
    where: { OR: [{ studentId: key }, { email: { equals: key, mode: "insensitive" } }] },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) return {};

  const err = await sendVerificationEmail(user.id);
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
