ALTER TABLE "ScenarioReading"
  ADD COLUMN "recheckResult" TEXT,
  ADD COLUMN "recheckNote" TEXT,
  ADD COLUMN "recheckedAt" TIMESTAMP(3),
  ADD CONSTRAINT "ScenarioReading_recheck_complete" CHECK (
    ("recheckResult" IS NULL AND "recheckNote" IS NULL AND "recheckedAt" IS NULL)
    OR ("deployedPhase" IS NOT NULL AND "recheckResult" IS NOT NULL
        AND "recheckResult" IN ('해결', '부분 해결', '미해결', '확인 불가')
        AND "recheckNote" IS NOT NULL AND length(trim("recheckNote")) BETWEEN 1 AND 1500
        AND "recheckedAt" IS NOT NULL)
  );
