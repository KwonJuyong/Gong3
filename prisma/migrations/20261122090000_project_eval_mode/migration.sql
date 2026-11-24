-- AlterTable
ALTER TABLE "Project" ADD COLUMN "evalMode" TEXT NOT NULL DEFAULT 'SURVEY',
ADD COLUMN "serviceId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 동행 평가 의뢰가 있는 기존 평가는 동행 평가로 봄
UPDATE "Project" SET "evalMode" = 'ACCOMPANY' WHERE id IN (SELECT "projectId" FROM "ScenarioBrief");

-- 설문형 평가는 원본 설문의 서비스를 평가 대상으로 기록
UPDATE "Project" p SET "serviceId" = v."serviceId" FROM "SurveyVersion" v WHERE p."surveyVersionId" = v.id;
