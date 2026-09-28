-- 가입 이메일 인증.
--
-- 그전까지는 아무 이메일이나 적어도 가입이 됐다. 폼에서 required 이긴 했지만 **검증이
-- 없어서** "수집은 했는데 못 믿는 값"이었고, 그래서 비밀번호 재설정 같은 복구 경로를
-- 이메일에 걸 수가 없었다. 이제 메일로 간 링크를 눌러야 로그인이 열린다.
--
-- ⚠⚠ **기존 사용자는 전부 인증된 것으로 간주한다**(emailVerifiedAt = createdAt).
--    소급 인증을 요구하면 지금 쓰고 있는 사용자가 **전원 로그인 불가**가 된다.
--    "이미 가입한 사람은 어쩔 수 없고, 신규만 제대로 받는다"가 결정 사항이다(2026-07-31).
--    email 이 비어 있는 계정도 함께 인정한다 — 없다고 잠그면 같은 사고가 난다.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- 기존 사용자 grandfather. 이 한 줄이 빠지면 배포 즉시 전원이 로그인하지 못한다.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
