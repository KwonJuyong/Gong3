-- CreateTable
CREATE TABLE "ScenarioBrief" (
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "lowerBetter" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScenarioBrief_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ScenarioTask" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stuckAt" TIMESTAMP(3),
    "incident" TEXT,

    CONSTRAINT "ScenarioTask_pkey" PRIMARY KEY ("projectId","userId","phase")
);

-- CreateTable
CREATE TABLE "ScenarioReading" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "rating" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "decision" TEXT,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "deployedPhase" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioReading_pkey" PRIMARY KEY ("projectId","userId","phase")
);

-- CreateTable
CREATE TABLE "ScenarioRelease" (
    "projectId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioRelease_pkey" PRIMARY KEY ("projectId","phase")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioReading_id_key" ON "ScenarioReading"("id");

-- CreateIndex
CREATE INDEX "ScenarioReading_projectId_phase_idx" ON "ScenarioReading"("projectId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioRelease_projectId_version_key" ON "ScenarioRelease"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ScenarioBrief" ADD CONSTRAINT "ScenarioBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioTask" ADD CONSTRAINT "ScenarioTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ScenarioBrief"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioTask" ADD CONSTRAINT "ScenarioTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioReading" ADD CONSTRAINT "ScenarioReading_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ScenarioBrief"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioReading" ADD CONSTRAINT "ScenarioReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRelease" ADD CONSTRAINT "ScenarioRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ScenarioBrief"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;
