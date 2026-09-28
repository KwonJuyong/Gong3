-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('PAPER', 'NEWS');

-- CreateTable
CREATE TABLE "InsightItem" (
    "id" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "summaryKo" TEXT,
    "authors" TEXT[],
    "category" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelScore" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "organization" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightSync" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InsightSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightItem_kind_publishedAt_idx" ON "InsightItem"("kind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsightItem_source_externalId_key" ON "InsightItem"("source", "externalId");

-- CreateIndex
CREATE INDEX "ModelScore_source_metric_rank_idx" ON "ModelScore"("source", "metric", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ModelScore_source_metric_modelKey_key" ON "ModelScore"("source", "metric", "modelKey");

-- CreateIndex
CREATE INDEX "InsightSync_source_startedAt_idx" ON "InsightSync"("source", "startedAt");

