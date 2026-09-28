-- 계정 인계 링크 토큰.
--
-- 이메일이 없는 기존 계정(2026-03-05 일괄 등록분)은 비밀번호가 학번 그 자체라
-- 「학번 + 비밀번호」를 묻는 복구 경로가 게이트 구실을 못 한다. 인증 근거를
-- 「아는 값」에서 「관리자에게서 받은 값」으로 바꾸기 위한 테이블이다.
--
-- 새 테이블만 만든다 — 기존 행을 건드리지 않으므로 grandfather UPDATE 가 필요 없다.

CREATE TABLE "AccountClaimToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountClaimToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountClaimToken_tokenHash_key" ON "AccountClaimToken"("tokenHash");
CREATE INDEX "AccountClaimToken_userId_idx" ON "AccountClaimToken"("userId");

ALTER TABLE "AccountClaimToken"
    ADD CONSTRAINT "AccountClaimToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
