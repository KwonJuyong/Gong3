-- 원장이 "우리 돈 아닌 것"과 "아직 안 나간 돈"을 구분하게 만든다.
--
-- ## LedgerEntry.liability — 비현금 부채 컬럼
--
-- 전에는 amount 하나로 현금과 부채를 같이 표현하려 했다. `record()` 가
-- `amount = magnitude × SIGN[kind]` 로 쓰는데 TAX_WITHHELD 의 부호가 0 이라
-- **원천징수액이 0 으로 저장됐다.** 그래서 summary().taxPayable 이 구조적으로 항상 0 이었고
-- "원천징수 미납" 카드는 한 번도 값이 뜬 적이 없다. 받아둔 세금이 장부 어디에도 없었다는 뜻이다.
--
-- amount 는 그대로 "현금 증감"(SUM = 통장 잔액)으로 두고, 부채는 새 컬럼으로 뺀다.
-- 부가세도 같은 문제였다 — PAYMENT_IN 이 세액 포함 전액을 현금으로 쌓는데 그중 얼마가
-- 납부할 부가세인지 표시할 곳이 없어서 현금 잔액이 부풀어 보였다.
--
-- ⚠ 기존 TAX_WITHHELD 행이 있다면 amount=0 이고 liability 도 0 이라 **소급 복구가 안 된다**
--    (금액이 애초에 저장된 적이 없다). 첫 실지급 전이라 해당 행이 없을 것으로 보지만,
--    있다면 Reward.taxAmount 에서 직접 집계해 수동 보정해야 한다.
--
-- ## Order.refundAmount / refundSentAt, Payment.refundSentAt — 확정 ≠ 송금
--
-- 학생 지급은 Payout 으로 "확정"과 "실제 이체"를 분리했는데 기업 환불은 안 돼 있었다.
-- 마감·취소 순간에 원장에 환불(−)을 쌓지만 실제 이체는 나중에 손으로 한다. 그래서
-- 안 보낸 환불이 현금 감소로 먼저 잡혀 cashBalance() 가 실제 통장보다 낮게 나왔고,
-- 환불을 정말 보냈는지 기록할 곳도 없어 빠뜨려도 티가 안 났다.

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "liability" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundAmount" INTEGER,
ADD COLUMN     "refundSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundSentAt" TIMESTAMP(3);
