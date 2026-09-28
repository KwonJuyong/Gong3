-- 정산 정보(계좌·주민번호) 수집 경로를 평가단 보상 쪽에도 열면서 필요해진 두 가지 기록.
--
-- consentAt        : 본인이 개인정보 수집·이용에 동의한 시각. 주민번호는 고유식별정보라
--                    별도 동의가 필요한데, 노무비는 청구서(LaborClaim.consent)에 건별로
--                    남지만 보상 정산에는 남을 데가 없었다.
-- updatedByAdmin*  : 관리자 대리입력 감사. 학생이 카톡으로 계좌를 보내는 실무를 커버하려고
--                    대리입력을 허용했으므로(2026-07-29 결정), 누가 언제 대신 넣었는지는 남긴다.
--
-- 기존 행은 전부 NULL 이다 = 노무비 청구서로 이미 동의를 받은 건이라 소급 동의를 요구하지
-- 않는다. 화면에서는 "본인 확인 필요"로 표시될 뿐 지급을 막지 않는다.

-- AlterTable
ALTER TABLE "PayrollProfile" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "updatedByAdminId" TEXT,
ADD COLUMN     "updatedByAdminAt" TIMESTAMP(3);
