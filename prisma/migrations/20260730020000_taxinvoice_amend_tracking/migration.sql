-- 환불 후 수정세금계산서 발행 의무를 추적한다.
--
-- 세금계산서를 발행한 뒤 환불(미달분 환불 · 수납 취소)이 나가면 매출과 매출세액이 과대
-- 신고된 상태가 된다. 수정세금계산서를 발행해야 하는데 우리 코드에는 그 경로가 전혀 없었다
-- (popbill.ts 에 cancelIssue 계열 함수 자체가 없다).
--
-- 발행 API 연동은 아직 하지 않는다 — 팝빌은 상수·필드명이 문자열이라 빌드가 못 잡고
-- 실제로 호출해봐야 드러난다(docs/popbill.md "겪은 오류코드"). 검증 없이 돈 계통에
-- 미검증 API 호출을 넣지 않는다. 대신 **의무를 놓치지 않게** 추적만 한다:
--
--   발행됨(taxInvoiceIssued) + 환불 송금됨 + taxInvoiceAmendedAt IS NULL
--     → 화면에 "수정세금계산서 발행 필요" 경고
--     → 관리자가 팝빌/홈택스에서 발행한 뒤 완료 처리하면 이 값이 채워진다

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "taxInvoiceAmendedAt" TIMESTAMP(3);
