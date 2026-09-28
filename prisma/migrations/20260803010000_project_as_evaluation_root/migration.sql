-- 평가의 정본을 `Project` 로 올린다 (2026-08-03).
--
-- ## 무엇이 문제였나
--
-- 학생이 참여하는 단위(`Project`)와 돈이 붙은 단위(`SurveyVersion`+`Order`)가 **서로 다른
-- 테이블**이었다. 그래서 `평가 만들기`로 만든 건 자동이든 수동이든 전부 보상이 없었다.
--
--   평가 만들기 → 자동 → Project (설문 문항을 **복사**)  → 보상 없음
--   평가 만들기 → 수동 → Project                        → 보상 없음
--   서비스 → 설문 동결 → SurveyVersion → Order → Reward  → 보상 있음
--
-- 같은 문항이 두 곳에 존재했고 한쪽만 돈이 붙어 있었다. 업체가 평가를 만들면
-- **학생에게 줄 돈이 아무 데도 없었다.**
--
-- ## 어떻게 바꾸나
--
-- `Project` 를 평가의 정본으로 삼는다 — 학생 참여·선발·일정·달력이 이미 여기 있다.
-- `SurveyVersion` 은 **문항 원본**으로만 남고 학생이 직접 응답하는 대상이 아니게 된다.
--
-- 두 축을 1급 필드로 올린다. 둘은 직교한다 — **수동이라고 고객이 정해지지 않는다.**
--   questionSource  AUTO | MANUAL                          ← 문항을 어떻게 만드나
--   fundingType     COMPANY | UNIVERSITY | RESEARCH_FUND   ← 누가 내고 누가 지급자인가
--
-- ⚠ **파괴적 이관을 하지 않는다.** `Order.surveyVersionId` · `Reward.surveyResponseId` 는
--   원장·세금계산서·지급명세서와 엮여 있다. 옮기다 실패하면 복구가 안 되므로 **컬럼을
--   추가**하고 신규 건만 새 링크(`Order.projectId` · `Reward.responseId`)를 쓴다.
--   기존 건은 레거시 링크로 그대로 동작한다.

-- AlterTable — Project 에 두 축과 정원·마감을 붙인다
ALTER TABLE "Project"
  ADD COLUMN "questionSource"    TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "surveyVersionId"   TEXT,
  ADD COLUMN "fundingType"       TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "contractRef"       TEXT,
  ADD COLUMN "fundRef"           TEXT,
  ADD COLUMN "fundConfirmedAt"   TIMESTAMP(3),
  ADD COLUMN "fundConfirmedById" TEXT,
  ADD COLUMN "rewardPerPerson"   INTEGER,
  ADD COLUMN "closedAt"          TIMESTAMP(3);

-- AlterTable — 발주가 평가를 가리킨다 (신규 경로)
ALTER TABLE "Order" ADD COLUMN "projectId" TEXT;

-- AlterTable — 보상이 평가 응답에 붙는다 (신규 경로)
ALTER TABLE "Reward" ADD COLUMN "responseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_projectId_key" ON "Order"("projectId");
CREATE UNIQUE INDEX "Reward_responseId_key" ON "Reward"("responseId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_surveyVersionId_fkey"
  FOREIGN KEY ("surveyVersionId") REFERENCES "SurveyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_responseId_fkey"
  FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ⚠⚠ 기존 평가 grandfather — 이 줄이 빠지면 **지금 살아 있는 평가가 학생 화면에서
--    전부 사라진다.** 새 공개 조건이 "자금 확인"을 요구하는데 기존 행에는 그게 없기 때문이다.
--
--    `RESEARCH_FUND` 로 표시하는 건 편법이 아니라 **사실에 맞다** — 그때는 결제 경로가
--    아예 없었고(대시보드 평가에 Order 가 붙은 적이 없다), 학생 보상이 나갔다면 연구비
--    노무비 계통이었다. `COMPANY` 로 두면 있지도 않은 발주를 기다리며 영영 안 열린다.
UPDATE "Project"
  SET "fundingType" = 'RESEARCH_FUND', "fundConfirmedAt" = "createdAt"
  WHERE "fundConfirmedAt" IS NULL;
