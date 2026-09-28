-- 전자서명·직인을 민감 첨부로 편입 + (ownerId, kind) unique 해제 (2026-08-18).
--
-- ## 왜 unique 를 푸는가 — 서명은 스냅샷이기 때문이다
--
-- 신분증·통장사본은 "그 사람의 현재 서류"라 한 벌만 있으면 되고, 다시 올리면 교체하는 게
-- 맞다(고유식별정보를 쌓아두지 않는다). 그래서 `(ownerId, kind)` 를 unique 로 뒀다.
--
-- **그런데 전자서명은 다르다.** `LaborClaim.signatureUrl` 은 **제출 시점 스냅샷**이다 —
-- 청구확인서 PDF 는 그때 그 서명으로 재생성될 수 있어야 한다. unique + 교체 방식이면
-- 학생이 서명을 다시 올리는 순간 **이미 확정된 옛 청구서의 서명까지 바뀐다.**
-- 서명 이미지는 문서의 진정성을 뒷받침하는 것이라 소급 변경은 있을 수 없다.
--
-- 그래서 종류별로 규칙이 갈린다:
--
--   ID_CARD · BANKBOOK  → 한 벌만. 다시 올리면 **교체**(옛 파일도 삭제)
--   SIGNATURE · SEAL    → **append-only.** 새로 올리면 새 행, 옛 행은 그대로 남는다
--
-- DB 제약 하나로 둘을 표현할 수 없으므로 **애플리케이션에서 강제**한다
-- (`POST /api/attachments` 가 SINGLETON_KINDS 면 이전 것을 지운다).
-- 동시 업로드로 두 행이 생길 여지는 남지만, 마지막 것이 표시되고 남는 건 고아 파일뿐이라
-- 스냅샷이 깨지는 쪽보다 훨씬 가볍다.
--
-- ## 기존 서명 파일은 옮기지 않는다
--
-- `public/uploads` 에 있는 옛 서명은 **그대로 둔다.** `readImageForPdf` 가 옛 URL
-- (`/api/uploads/x.png`)과 새 URL(`/api/attachments/<id>`)을 **둘 다** 읽는다.
-- 한 번에 갈아엎으면 이미 확정된 청구서 PDF 가 통째로 서명 없이 나온다.
-- 새로 올리는 것부터 안전한 저장소로 가고, 옛 파일 이관은 별도 스크립트로 나중에 한다.
-- ⚠ 즉 **이 마이그레이션만으로 기존 서명 노출이 사라지지는 않는다.**

-- DropIndex
-- IF EXISTS 를 붙인다. 앞 마이그레이션(private_attachments)이 만든 인덱스라 정상
-- 순서에서는 반드시 존재하지만, 그 마이그레이션을 db push 등 다른 경로로 적용한 환경에서
-- 이름이 다를 수 있다. 없다고 배포 전체가 멈추는 쪽이 더 나쁘다.
DROP INDEX IF EXISTS "Attachment_ownerId_kind_key";

-- CreateIndex
CREATE INDEX "Attachment_ownerId_kind_idx" ON "Attachment"("ownerId", "kind");
