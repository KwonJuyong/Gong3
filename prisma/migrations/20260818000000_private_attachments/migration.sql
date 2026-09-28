-- 민감 첨부(신분증·통장사본)를 public/ 밖에 저장한다 (2026-08-18).
--
-- ## 무엇이 문제였나
--
-- 업로드된 파일이 **인증 없이 URL 만으로 열린다.** `/uploads/<파일명>` 이 라우트를 우회해
-- 200 을 준다(2026-07-29 운영 실측). 원인은 셋이 겹친 것이다 —
-- ① 업로드가 전부 `public/uploads/` 에 저장되고 ② Next 가 `public/` 을 런타임에 정적
-- 서빙하며 ③ compose 가 거기에 볼륨을 마운트한다. `/api/uploads/[filename]` 은 MIME
-- 통제용일 뿐, 그 옆에 우회 경로가 항상 열려 있었다.
--
-- ## 🔴 "라우트에 세션 검사 추가"로는 못 고친다
--
-- `/api/uploads/[filename]` 이 아는 건 UUID 파일명 하나뿐이다. "이 사용자가 이 파일을 볼
-- 수 있나"를 판정하려면 **파일의 주인**을 알아야 하는데 그 정보가 DB 에 없었다. URL 문자열이
-- `PayrollProfile.signatureUrl`·메시지 첨부 JSON·설문 응답 값·`User.profileImage` 에
-- 흩어져 있을 뿐이라, 네 곳을 역방향 조회하는 건 깨지기 쉽고 느리다.
--
-- **메타데이터 테이블이 인증의 선행 조건이다.** 이 테이블이 그것이고, 덕분에 접근 규칙이
-- 한 줄이 된다: `ownerId = 나` 또는 `ADMIN`.
--
-- ## ⚠ 기존 3계통은 옮기지 않는다
--
-- 프로필 사진·전자서명·메신저 첨부·설문 첨부는 그대로 둔다. 한꺼번에 옮기면 PDF 생성·
-- 메신저·설문이 전부 URL 문자열에 의존해서 회귀 위험이 크다. **신규 민감 첨부부터 제대로
-- 만들고 기존은 분리한다** — 그쪽은 여전히 미해결이고 `docs/uploads-security.md` 에 남아 있다.
--
-- ## 같은 종류는 한 벌만
--
-- (ownerId, kind) 를 unique 로 둔다. 다시 올리면 교체하고 옛 파일은 디스크에서 지운다.
-- 고유식별정보라 "받아서 계속 쌓아둔다"가 기본값이면 안 된다.
--
-- ⚠ 저장 경로(`/app/private-uploads`)는 **새 docker 볼륨**이다. compose 를 같이 고치지
--   않으면 컨테이너 안에만 쌓이고 재배포 때 날아간다.

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "origName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "Attachment"("storedName");
CREATE INDEX "Attachment_kind_idx" ON "Attachment"("kind");
CREATE UNIQUE INDEX "Attachment_ownerId_kind_key" ON "Attachment"("ownerId", "kind");

-- AddForeignKey
-- 주인이 탈퇴로 지워지면 파일 메타도 같이 지운다(실제 파일 정리는 애플리케이션 몫).
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- 올린 사람은 감사 정보다. 그 사람이 지워진다고 첨부가 사라지면 안 되므로 Restrict.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
