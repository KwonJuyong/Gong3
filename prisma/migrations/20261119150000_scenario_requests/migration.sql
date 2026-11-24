CREATE TABLE "ScenarioRequest" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "phase" INTEGER NOT NULL CHECK ("phase" > 0), "note" TEXT NOT NULL,
  "decision" TEXT, "reply" TEXT, "repliedAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deployedPhase" INTEGER, "recheckResult" TEXT, "recheckNote" TEXT, "recheckedAt" TIMESTAMP(3),
  FOREIGN KEY ("projectId","userId","phase") REFERENCES "ScenarioReading" ("projectId","userId","phase") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (
    ("recheckResult" IS NULL AND "recheckNote" IS NULL AND "recheckedAt" IS NULL)
    OR ("deployedPhase" IS NOT NULL AND "recheckResult" IS NOT NULL
        AND "recheckResult" IN ('해결', '부분 해결', '미해결', '확인 불가')
        AND "recheckNote" IS NOT NULL AND length(trim("recheckNote")) BETWEEN 1 AND 1500
        AND "recheckedAt" IS NOT NULL)
  )
);
CREATE INDEX "ScenarioRequest_projectId_userId_phase_idx" ON "ScenarioRequest" ("projectId","userId","phase");
INSERT INTO "ScenarioRequest" ("id","projectId","userId","phase","note","decision","reply","repliedAt","requestedAt","deployedPhase","recheckResult","recheckNote","recheckedAt")
SELECT "id","projectId","userId","phase","note","decision","reply","repliedAt",COALESCE("requestedAt","createdAt"),"deployedPhase","recheckResult","recheckNote","recheckedAt"
FROM "ScenarioReading" WHERE "phase" > 0 AND "note" <> '';
