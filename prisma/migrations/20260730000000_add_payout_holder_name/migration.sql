-- 예금주(holderName) — 이체가 실패하는 가장 흔한 원인을 없앤다.
--
-- 그전까지 Payout.holderName 에는 User.name 을 그대로 박았다. 학생 계좌가 부모·배우자
-- 명의이거나 개설 당시 이름이 다르면 예금주 불일치로 그 줄만 이체가 튕긴다.
-- 관리자는 왜 튕겼는지 알 수 없고, 학생에게는 "계좌를 등록했는데 돈이 안 들어온다"로 보인다.
--
-- NULL = 본인 이름과 같다는 뜻으로 읽는다(generatePayouts 가 User.name 으로 폴백).
-- 그래서 기존 행은 마이그레이션만으로 동작이 바뀌지 않는다.

-- AlterTable
ALTER TABLE "PayrollProfile" ADD COLUMN     "holderName" TEXT;
