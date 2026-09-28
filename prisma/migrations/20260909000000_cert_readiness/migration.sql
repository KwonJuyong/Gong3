-- 시험인증 준비도 자가점검 (2026-09-09).
--
-- ## 무엇인가
--
-- 「시험인증 준비」 화면(부가 기능)이 서비스별로 저장하는 자가점검 답이다.
-- 문항별 예/아니오/해당없음만 담는다.
--
-- ## 왜 JSON 한 컬럼인가
--
-- 문항의 정본은 코드(`app/lib/certChecklist.ts`)에 있고 조건부 문항이 서비스 속성
-- (AI 여부·개인정보·안전 민감)에 따라 열린다. 문항을 행으로 쪼개면 코드에서 문항을
-- 하나 고칠 때마다 마이그레이션이 따라붙고, 지워진 문항의 고아 행이 남는다.
-- 이 값은 집계·검색 대상이 아니라 **그 서비스 담당자에게 다시 보여주기 위한 것**이므로
-- 한 벌 통째로 읽고 쓰는 편이 맞다.
--
-- ⚠ 그래서 **점수·등급·합격 여부를 컬럼으로 두지 않는다.** 두는 순간 그 값이 판정처럼
--   읽히고, 문항을 고쳤을 때 옛 등급이 근거 없이 남는다. 「미비 항목」은 화면이 그때그때
--   계산한다. → docs/certification-readiness.md
--
-- ## 삭제 정책
--
-- 서비스가 지워지면 이 행도 의미가 없다. 다만 `Service` 삭제 경로가 지금 없으므로
-- ON DELETE 를 기본값(RESTRICT)으로 두어, 나중에 삭제를 붙일 때 여기서 한 번 걸리게 한다.
-- 조용히 사라지는 것보다 낫다.

CREATE TABLE "CertReadiness" (
    "id"          TEXT NOT NULL,
    "serviceId"   TEXT NOT NULL,
    "answers"     JSONB NOT NULL DEFAULT '{}',
    "note"        TEXT,
    "updatedById" TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertReadiness_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CertReadiness_serviceId_key" ON "CertReadiness"("serviceId");

ALTER TABLE "CertReadiness"
    ADD CONSTRAINT "CertReadiness_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
