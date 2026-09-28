-- 비밀번호 재설정을 토큰 기반으로 바꾸면서 필요해진 테이블.
--
-- 그전까지 재설정은 **지식 기반**이었다: 학번+이름+이메일+전화번호 네 개가 맞으면
-- 토큰도 메일 확인도 없이 그 자리에서 비밀번호를 바꿔줬다. 그 네 개는 같은 과 학생끼리
-- 서로 다 아는 값이라, 사실상 아무나 남의 계정을 가져갈 수 있는 상태였다.
--
-- 이제는 메일로 나간 링크를 눌러야 한다 = **메일함 접근을 증명**해야 한다.
-- 원본 토큰은 저장하지 않고 sha256 해시만 남긴다 — DB 가 새도 그 값으로 링크를 만들 수 없다.
-- 유효기간 30분, 1회용, 새 요청이 오면 그 사용자의 기존 토큰은 전부 지운다.

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
