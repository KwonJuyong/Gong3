-- AI 도우미 질의 감사 로그 (과업지시서 LOG-01~04, [표 7])
CREATE TABLE "QueryAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "target" TEXT,
    "policy" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "rowCount" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueryAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QueryAuditLog_createdAt_idx" ON "QueryAuditLog"("createdAt");
CREATE INDEX "QueryAuditLog_actorId_createdAt_idx" ON "QueryAuditLog"("actorId", "createdAt");
CREATE INDEX "QueryAuditLog_outcome_createdAt_idx" ON "QueryAuditLog"("outcome", "createdAt");
