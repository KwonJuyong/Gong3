import { logPersonalData } from "@/app/lib/accessLog";
/**
 * 민감 첨부 조회·삭제 — `GET|DELETE /api/attachments/[id]`
 *
 * 파일이 public/ 밖에 있어 이 라우트로만 접근할 수 있다. 프록시 캐시를 막으려고 no-store 로 응답한다.
 */
import { type NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "@/app/db";
import {
  ATTACHMENT_KINDS,
  attachmentPath,
  canAccessAttachment,
  contentDisposition,
  deleteAttachmentFile,
  type AttachmentKind,
} from "@/app/lib/attachments";

/** 인증 + 첨부 조회 + 권한. 세 라우트가 같은 판정을 쓴다. */
async function load(id: string) {
  const userId = await getSessionUserId();
  if (!userId) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!me) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const att = await prisma.attachment.findUnique({ where: { id } });
  // 존재 여부가 드러나지 않도록 권한이 없어도 404 로 돌려준다.
  if (!att || !canAccessAttachment(me, att)) {
    return { error: NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 }) };
  }
  return { me, att };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if (r.error) return r.error;
  const { att } = r;

  let buf: Buffer;
  try {
    buf = await readFile(attachmentPath(att.storedName));
  } catch {
    // DB 에는 있는데 디스크에 없는 경우(볼륨 미연결 등)
    return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 410 });
  }

  const label = ATTACHMENT_KINDS[att.kind as AttachmentKind] ?? "첨부";
  const ext = att.storedName.split(".").pop() ?? "bin";

  // 접속기록: 다른 사람의 첨부 열람(본인 것은 logPersonalData 가 건너뛴다)
  await logPersonalData(r.me.id, "VIEW", `첨부 열람: ${label}`, att.ownerId);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": att.mime,
      // PDF 는 스크립트를 품을 수 있어 다운로드로, 이미지는 인라인으로
      "Content-Disposition": contentDisposition(att.mime, `${label}.${ext}`),
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if (r.error) return r.error;
  const { me, att } = r;

  await prisma.attachment.delete({ where: { id: att.id } });
  await deleteAttachmentFile(att.storedName);

  // 다른 사람의 파일 삭제(ADMIN)는 감사 로그에 남긴다.
  if (att.ownerId !== me.id) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: me.id,
          targetId: att.ownerId,
          action: "ATTACHMENT_DELETE",
          summary: `${ATTACHMENT_KINDS[att.kind as AttachmentKind] ?? att.kind} 삭제`,
        },
      });
    } catch {
      /* 기록 실패가 삭제를 막지는 않는다 */
    }
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
