import { logPersonalData } from "@/app/lib/accessLog";
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { getSessionUserId } from "@/app/session-server";
import { ZipArchive } from "archiver";
import { prisma } from "../../../../db";
import { renderClaimPdfBuffer } from "../../../../dashboard/payroll/pdfData";
import {
  ATTACHMENT_KINDS,
  readAttachmentFile,
  type AttachmentKind,
} from "../../../../lib/attachments";

function safeFileName(name: string) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (!me || me.role !== "ADMIN") {
      return NextResponse.json({ error: "내보내기 권한이 없습니다." }, { status: 403 });
    }
    const rl = checkLimit("adminDocument", me.id);
    if (rl) return NextResponse.json({ error: rl }, { status: 429 });

    const { batchId } = await params;
    const batch = await prisma.claimBatch.findUnique({
      where: { id: batchId },
      include: {
        claims: {
          include: { user: { select: { id: true, studentId: true, name: true } } },
          orderBy: { user: { studentId: "asc" } },
        },
      },
    });
    if (!batch) {
      return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
    }
    if (batch.claims.length === 0) {
      return NextResponse.json({ error: "생성된 청구서가 없습니다." }, { status: 400 });
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", (e: Error) => reject(e));
    });

    // 첨부(신분증·통장사본)를 한 번에 읽어둠. 청구자마다 쿼리하면 N+1 임
    const ownerIds = batch.claims.map((c) => c.user?.id).filter((v): v is string => !!v);
    const attachments = await prisma.attachment.findMany({
      // 서명·직인은 청구서 PDF 안에 이미 들어가므로 묶지 않음
      where: { ownerId: { in: ownerIds }, kind: { in: ["ID_CARD", "BANKBOOK"] } },
      select: { ownerId: true, kind: true, storedName: true },
    });
    const byOwner = new Map<string, typeof attachments>();
    for (const a of attachments) {
      const list = byOwner.get(a.ownerId);
      if (list) list.push(a);
      else byOwner.set(a.ownerId, [a]);
    }

    // 사람마다 폴더 하나. 파일만 따로 메일에 첨부해도 구분되도록 파일명에도 학번_이름을 붙임
    for (const claim of batch.claims) {
      const base = safeFileName(`${claim.user?.studentId || ""}_${claim.user?.name || claim.name}`);
      const pdf = await renderClaimPdfBuffer(claim);
      archive.append(pdf, { name: `${base}/${base}_청구확인서.pdf` });

      for (const a of byOwner.get(claim.user?.id ?? "") ?? []) {
        const label = ATTACHMENT_KINDS[a.kind as AttachmentKind] ?? a.kind;
        const ext = a.storedName.split(".").pop() ?? "bin";
        try {
          // 첨부는 디스크에서 직접 읽음
          archive.append(await readAttachmentFile(a.storedName), {
            name: `${base}/${base}_${label}.${ext}`,
          });
        } catch {
          // 파일이 없어도 ZIP 전체를 실패시키지 않고, 빠졌다는 메모를 넣음
          archive.append(
            `이 파일을 읽지 못했습니다 (${a.storedName}). 관리자에게 재업로드를 요청하세요.\n`,
            { name: `${base}/${base}_${label}_없음.txt` },
          );
        }
      }
    }

    await archive.finalize();
    await done;

    const zip = Buffer.concat(chunks);
    // 접속기록: 청구서·신분증·통장사본 묶음 출력
    await logPersonalData(me.id, "EXPORT", `노무비 청구 묶음(신분증·통장) ${batch.title} (${batch.claims.length}명)`);
    const filename = `${safeFileName(batch.title)}_노무비.zip`;
    const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[payroll/export] ZIP 생성 실패:", err);
    return NextResponse.json({ error: "ZIP 내보내기 중 오류가 발생했습니다." }, { status: 500 });
  }
}
