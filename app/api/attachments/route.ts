/**
 * 민감 첨부 업로드: `POST /api/attachments`
 *
 * `multipart/form-data`: `file` · `kind`(ID_CARD|BANKBOOK) · `ownerId`(선택, ADMIN 만)
 *
 * public/ 밖에 저장하고 Attachment 행으로 소유자를 기록함
 * 파일 형식은 file.type 이 아니라 내용(매직넘버)으로 판정함
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "@/app/db";
import { checkRateLimit } from "@/app/rate-limit";
import { checkUploadQuota } from "@/app/lib/uploadGuard";
import {
  MAX_ATTACHMENT_SIZE,
  deleteAttachmentFile,
  isAttachmentKind,
  makeStoredName,
  saveAttachmentFile,
  sniffMime,
  isSingletonKind,
  ATTACHMENT_KINDS,
} from "@/app/lib/attachments";

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!me) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  // formData() 는 본문 전체를 메모리에 올리므로 크기를 먼저 봄. 서명·직인은 쌓이므로 횟수도 제한함
  const declared = Number(request.headers.get("content-length") ?? "");
  if (!Number.isFinite(declared) || declared > MAX_ATTACHMENT_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "파일 크기는 10MB 이하만 가능합니다." }, { status: 413 });
  }
  const rl = checkRateLimit(`attachment:${me.id}`, 30, 10 * 60 * 1000);
  if (rl) return NextResponse.json({ error: rl }, { status: 429 });
  const quotaErr = await checkUploadQuota(me.id, "attachment", declared);
  if (quotaErr) return NextResponse.json({ error: quotaErr }, { status: 429 });

  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const rawOwner = String(form.get("ownerId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (!isAttachmentKind(kind)) {
    return NextResponse.json({ error: "첨부 종류가 올바르지 않습니다." }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return NextResponse.json({ error: "파일 크기는 10MB 이하만 가능합니다." }, { status: 400 });
  }

  // 다른 사람 명의 업로드(대리 업로드)는 ADMIN 만 할 수 있음
  const ownerId = rawOwner && me.role === "ADMIN" ? rawOwner : me.id;
  if (ownerId !== me.id) {
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "대상 사용자를 찾을 수 없습니다." }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) {
    return NextResponse.json(
      { error: "이미지(PNG·JPG·WebP) 또는 PDF 만 올릴 수 있습니다." },
      { status: 400 },
    );
  }

  const storedName = makeStoredName(mime);
  await saveAttachmentFile(storedName, buf);

  // ID_CARD·BANKBOOK 은 한 벌만 두고 교체함. SIGNATURE·SEAL 은 제출된 청구서가
  // 참조하므로 교체하지 않고 쌓음
  const saved = await prisma.attachment.create({
    data: {
      kind,
      ownerId,
      uploadedById: me.id,
      storedName,
      origName: file.name.slice(0, 200),
      mime,
      size: buf.length,
    },
    select: { id: true, kind: true, origName: true, mime: true, size: true, createdAt: true },
  });

  if (isSingletonKind(kind)) {
    const stale = await prisma.attachment.findMany({
      where: { ownerId, kind, id: { not: saved.id } },
      select: { id: true, storedName: true },
    });
    if (stale.length > 0) {
      await prisma.attachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
      await Promise.all(stale.map((a) => deleteAttachmentFile(a.storedName)));
    }
  }

  // 대리 업로드는 감사 로그에 남김
  if (ownerId !== me.id) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: me.id,
          targetId: ownerId,
          action: "ATTACHMENT_UPLOAD",
          summary: `${ATTACHMENT_KINDS[kind]} 대리 업로드 (${file.name.slice(0, 60)})`,
        },
      });
    } catch {
      /* 기록 실패가 업로드를 막지는 않음 */
    }
  }

  return NextResponse.json({ attachment: saved }, { headers: { "Cache-Control": "no-store" } });
}
