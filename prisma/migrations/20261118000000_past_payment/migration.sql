-- 플랫폼 지급 기능 도입 전 참여 보상 기록(실적 집계 전용). 새 테이블만 추가

CREATE TABLE "PastPayment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "studentId" TEXT,
    "amount" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PastPayment_projectId_idx" ON "PastPayment"("projectId");

ALTER TABLE "PastPayment" ADD CONSTRAINT "PastPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
