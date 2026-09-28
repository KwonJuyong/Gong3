-- 세금계산서 국세청 전송 결과 추적.
-- 발행(300)과 국세청 전송(304 성공 / 305 실패)은 팝빌에서 별개 단계이고, 전송은 비동기라
-- 발행 응답에 결과가 없다. 주기적 조회(/api/settlement/invoice-sync)로 채운다.
-- 기존 행은 NULL = "아직 확인 안 됨" 이고, 다음 동기화에서 조회 대상이 된다.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "taxInvoiceNtsState" INTEGER,
ADD COLUMN     "taxInvoiceNtsCheckedAt" TIMESTAMP(3);
