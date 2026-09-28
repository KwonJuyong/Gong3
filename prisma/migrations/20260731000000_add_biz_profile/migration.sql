-- 기업 사업자 정보(BizProfile) — 발주 폼이 매번 다시 조회하던 값에 저장소를 준다.
--
-- 그전까지 발주 폼의 사업자번호·상호·대표자·주소·계산서 이메일은 **직전 Order 에서**
-- 프리필했다. 그래서 두 가지가 막혔다:
--   1) 첫 발주 전에는 미리 넣어둘 곳이 없다 — 결재 올리기 전에 정보를 채워둘 수 없었다.
--   2) 직전 발주가 없으면 팝빌 기업정보조회(50원/건)를 매 발주마다 다시 눌러야 한다.
--
-- ⚠ Order 의 biz* 컬럼은 **건드리지 않는다.** 그건 발행 시점 스냅샷이라 그대로 남아야 한다 —
--    여기 값을 나중에 고쳤다고 이미 발행된 세금계산서의 상호가 따라 바뀌면 안 된다.
--
-- 기존 사용자는 행이 없다(= 프로필 미입력). 발주 화면은 BizProfile → 직전 Order →
-- 가입 이메일 순으로 폴백하므로 이 마이그레이션만으로 동작이 달라지지 않는다.

-- CreateTable
CREATE TABLE "BizProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bizNo" TEXT NOT NULL DEFAULT '',
    "bizName" TEXT NOT NULL DEFAULT '',
    "bizCeo" TEXT NOT NULL DEFAULT '',
    "bizAddr" TEXT NOT NULL DEFAULT '',
    "bizEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BizProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BizProfile_userId_key" ON "BizProfile"("userId");

-- AddForeignKey
ALTER TABLE "BizProfile" ADD CONSTRAINT "BizProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
