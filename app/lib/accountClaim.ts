import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "../db";

/**
 * 계정 인계 링크. 이메일이 없는 기존 계정에 관리자가 발급하는 1회용 링크로,
 * 받은 사람이 로그인용 이메일과 비밀번호를 설정한다.
 *
 * 관리자가 본인 확인 후 직접 전달하므로 학번 같은 지식 정보에 의존하지 않는다.
 * 토큰 원본은 저장하지 않고 sha256 해시만 남긴다. 원본은 발급 시 한 번만 반환한다.
 * 사람이 메신저로 전달하는 시간을 고려해 유효기간은 7일이다.
 */

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** 7일 */
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IssuedClaim {
  userId: string;
  name: string;
  studentId: string;
  phone: string | null;
  /** 원본 토큰. 저장하지 않으므로 이때만 얻을 수 있다. */
  token: string;
}

/** 인계 토큰을 발급한다. 같은 사용자의 이전 토큰은 무효가 되도록 지운다. */
export async function issueClaimTokens(userIds: string[]): Promise<IssuedClaim[]> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, studentId: true, phone: true },
  });

  const out: IssuedClaim[] = [];
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);

  for (const u of users) {
    const raw = randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.accountClaimToken.deleteMany({ where: { userId: u.id } }),
      prisma.accountClaimToken.create({
        data: { userId: u.id, tokenHash: hash(raw), expiresAt },
      }),
    ]);
    out.push({ userId: u.id, name: u.name, studentId: u.studentId, phone: u.phone, token: raw });
  }

  return out;
}

export type ClaimLookup =
  | { ok: true; userId: string; name: string; studentId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "done" };

/**
 * 링크를 열었을 때의 조회(소비하지 않음).
 * 토큰은 추측할 수 없는 난수라 실패 사유를 구분해 알려줘도 된다.
 */
export async function lookupClaimToken(token: string): Promise<ClaimLookup> {
  const row = await prisma.accountClaimToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, name: true, studentId: true, email: true } } },
  });

  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  // 링크를 받기 전에 다른 경로로 이미 이메일을 등록했다면 할 일이 없다.
  if (row.user.email) return { ok: false, reason: "done" };

  return { ok: true, userId: row.user.id, name: row.user.name, studentId: row.user.studentId };
}

/**
 * 토큰을 사용 처리한다. 링크를 다시 열었을 때 구분할 수 있도록 행을 지우지 않고 usedAt 을 기록한다.
 * @returns 이미 사용됐으면 false (동시 제출 방지)
 */
export async function consumeClaimToken(token: string): Promise<boolean> {
  const res = await prisma.accountClaimToken.updateMany({
    where: { tokenHash: hash(token), usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return res.count === 1;
}
