-- 회원 상태(탈퇴·정지) + 관리자 조작 감사 로그 (2026-08-04).
--
-- ## 무엇이 문제였나
--
-- 회원 관리 화면이 **읽기 전용**이라 탈퇴 요청·역할 변경·정보 정정을 하려면 매번
-- SSH 터널로 Prisma Studio 를 열어야 했다. Studio 는 앱 검증(bcrypt·이메일 인증·
-- role/userType 짝)을 전부 우회하고 감사 흔적도 안 남는다.
--
-- 더 근본적으로 **탈퇴라는 개념이 스키마에 없었다.** 그래서 선택지가 행 삭제뿐이었는데,
-- 활동이 있는 계정은 FK 가 막고(그게 방어다) 억지로 지우면 지급명세서 근거가 사라진다.
--
-- ## 탈퇴는 삭제가 아니다
--
-- 상태만 바꾸고 로그인을 끊는다. 보상·노무비·원장은 그대로 남는다.
-- ⚠ 개인정보도 지우지 않는다 — 응답 데이터를 동의받아 수집했으므로 보유 근거가 있고,
--   이름·연락처는 그 데이터를 식별·정정하는 데 필요하다.
--   (주민등록번호는 근거가 법령이라 별개다. 정산 계통에서 따로 다룬다.)

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
                   ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- CreateTable
-- ⚠ actorId·targetId 를 FK 로 걸지 않는다. 감사 기록은 대상이 사라져도 남아야 하는데,
--   FK 를 걸면 대상 삭제가 막히거나(Restrict) 로그가 같이 지워진다(Cascade).
--   둘 다 감사 로그의 목적과 정반대다.
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_targetId_createdAt_idx" ON "AuditLog"("targetId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
