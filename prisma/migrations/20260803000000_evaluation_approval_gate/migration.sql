-- 평가 공개에 관리자 승인 게이트를 넣는다 (2026-08-03).
--
-- ## 무엇이 문제였나
--
-- 「기업」으로 가입하면 이메일+업체명만으로 role=DEVELOPER 가 됐고, 그 계정이 만든 평가는
-- **검토 없이 그 자리에서 학생에게 열렸다.** 두 계통 모두 구멍이 있었다:
--
--   Project        생성 즉시 status=RECRUITING + prisma.user.findMany() 전체 알림
--                  → 아무나 만든 평가가 전교생 알림함에 꽂혔고 되돌릴 방법이 없었다
--   SurveyVersion  status=CONFIRMED 이기만 하면 /dashboard/surveys 에 전원 노출.
--                  발주·결제를 보지 않는데 보상은 결제된 Order 가 붙은 회차에만 생긴다
--                  → **결제 안 한 기업이 동결만 해도 학생이 무보수로 응답**할 수 있었다
--
-- ## 어떻게 바꾸나
--
-- 만들기(기업이 자유롭게)와 내보내기(관리자 승인 후)를 분리한다. 승인은 행 하나에만
-- 유효해서 평가마다 매번 다시 받는다 — 별도 토큰이 필요 없다.
-- 공개 조건 판정은 `app/lib/approvals.ts` 한곳에 있다.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "approvedAt" TIMESTAMP(3),
                      ADD COLUMN     "approvedById" TEXT,
                      ADD COLUMN     "rejectedAt" TIMESTAMP(3),
                      ADD COLUMN     "rejectReason" TEXT;

-- AlterTable
ALTER TABLE "SurveyVersion" ADD COLUMN     "approvedAt" TIMESTAMP(3),
                            ADD COLUMN     "approvedById" TEXT,
                            ADD COLUMN     "rejectedAt" TIMESTAMP(3),
                            ADD COLUMN     "rejectReason" TEXT;

-- ⚠⚠ 기존 행 grandfather — 이 두 UPDATE 가 빠지면 **지금 살아 있는 평가가 배포 즉시
--    전부 학생 화면에서 사라진다.** 진행 중인 응답 수집이 통째로 멈춘다.
--    소급 승인을 요구하지 않는다는 게 결정 사항이다(2026-08-03).
--    가입 이메일 인증 때 emailVerifiedAt 을 채운 것과 같은 이유·같은 함정이다.

-- 이미 공개돼 있던 평가는 승인된 것으로 본다. PENDING_APPROVAL 은 이번에 생긴 상태값이라
-- 기존 행에는 존재하지 않으므로 전건 대상이다.
UPDATE "Project" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;

-- 동결된 회차만 채운다. DRAFT 는 애초에 학생에게 안 보였으므로 승인 대상이 아니고,
-- 나중에 동결하면 그때 정상적으로 승인을 받게 된다 — 그게 새 규칙의 의도다.
UPDATE "SurveyVersion" SET "approvedAt" = COALESCE("confirmedAt", "createdAt")
  WHERE "status" = 'CONFIRMED' AND "approvedAt" IS NULL;
