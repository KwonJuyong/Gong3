-- 세무 신고 기록 (2026-08-18).
--
-- ## 무엇이 문제였나
--
-- 신고 기한 리마인더는 있는데(`scripts/tax-reminder-cron.sh`) **제출 여부를 남길 곳이
-- 없었다.** `AppSetting` 에 있는 건 "알림을 보냈다"는 멱등키일 뿐이다. 그래서:
--
--   * 기한 알림이 계속 오는데 **냈는지 안 냈는지 시스템이 모른다**
--   * 데스크톱 2대 + 노트북을 오가는 작업 방식이라 **머리로도 모른다**
--   * 클라썸 건(첫 실거래)은 결국 전부 손으로 처리했고 무엇을 냈는지 어디에도 안 남았다
--
-- 집계는 언제든 다시 계산할 수 있다. **제출했다는 사실만 재구성할 수 없다.**
--
-- ## 🔴 스냅샷이 아니라 기록이다
--
-- 처음 설계는 제출 시점 집계를 **동결**하는 것이었는데 그건 틀렸다. **수정신고가 실제로
-- 있는 절차**다(홈택스 제출구분: 정기신고 / 수정신고 / 기한후신고). 수정신고를 하면
-- "신고한 값"이 바뀌는데 행이 동결돼 있으면 **기록이 곧 거짓**이 된다.
--
-- 그래서 금액 컬럼은 전부 수정 가능하고, 고친 사실은 `amendedAt` 으로 구분한다.
-- 현재 집계와 어긋나면 화면이 알려주되 **자동으로 덮어쓰지 않는다** — 신고서를 실제로
-- 고쳤는지는 사람만 알기 때문이다. 자동 동기화하면 "어긋났다"는 신호 자체가 사라진다.
--
-- ## (kind, year, month) unique
--
-- 두 번 눌러 두 건이 남으면 어느 게 진짜인지 모른다. 정정은 **행을 새로 만드는 게 아니라
-- 그 행을 고치는 것**이다.

-- CreateTable
CREATE TABLE "TaxFiling" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "grossAmount" INTEGER NOT NULL DEFAULT 0,
    "incomeTax" INTEGER NOT NULL DEFAULT 0,
    "localTax" INTEGER NOT NULL DEFAULT 0,
    "receiptNo" TEXT,
    "memo" TEXT,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filedById" TEXT NOT NULL,
    "amendedAt" TIMESTAMP(3),
    "amendedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxFiling_kind_year_month_key" ON "TaxFiling"("kind", "year", "month");
CREATE INDEX "TaxFiling_year_month_idx" ON "TaxFiling"("year", "month");

-- ⚠ filedById·amendedById 를 FK 로 걸지 않는다. AuditLog 와 같은 이유다 —
--   신고 기록은 그 관리자가 탈퇴해도 남아야 하는데, FK 를 걸면 삭제가 막히거나(Restrict)
--   기록이 같이 지워진다(Cascade). 둘 다 이 테이블의 목적과 정반대다.
