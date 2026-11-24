ALTER TABLE "ScenarioReading" ADD COLUMN "requestedAt" TIMESTAMP(3);
UPDATE "ScenarioReading" SET "requestedAt" = "createdAt" WHERE phase > 0 AND note <> '';
