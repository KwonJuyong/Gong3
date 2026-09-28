-- 개인정보처리시스템 접속기록(안전성 확보조치 기준 제8조) + 월 점검 이력 + 마지막 활동.
-- 새 테이블·새 nullable 컬럼만 추가한다 — 기존 행을 건드리지 않으므로 grandfather UPDATE 가 필요 없다.

ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastSeenIp" TEXT;

CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "account" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "subjectId" TEXT,
    "detail" TEXT,
    "result" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");
CREATE INDEX "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");
CREATE INDEX "AccessLog_ip_idx" ON "AccessLog"("ip");
CREATE INDEX "AccessLog_kind_createdAt_idx" ON "AccessLog"("kind", "createdAt");

CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "findings" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessReview_month_key" ON "AccessReview"("month");
