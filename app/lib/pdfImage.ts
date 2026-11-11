import "server-only";
import path from "path";
import { readFile } from "fs/promises";
// @/app/db 는 next/headers 까지 끌어오므로 ./prisma 에서 가져옴
import { prisma } from "@/app/prisma";
import { readAttachmentFile } from "./attachments";

/** 업로드된 이미지를 @react-pdf/renderer 의 <Image src> 형태로 읽음(노무비·견적서 공용). */

/** `/api/uploads/x.png` · `/uploads/x.png` → `public/uploads/x.png` 절대경로 */
export function resolveUploadPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/(?:api\/)?uploads\/([^/?#]+)$/);
  if (!m) return null;
  const filename = m[1];
  // 경로 탈출 차단. 파일명만 허용함
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null;
  return path.join(process.cwd(), "public", "uploads", filename);
}

function imageFormat(filename: string): "png" | "jpg" | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return null;
}

export type PdfImage = { data: Buffer; format: "png" | "jpg" };

/** `/api/attachments/<id>` → 첨부 id. 아니면 null. */
function attachmentIdOf(url: string | null | undefined): string | null {
  const m = (url ?? "").match(/^\/api\/attachments\/([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

/**
 * 이미지 URL → <Image src={...} />.
 *
 * /api/attachments/<id>(민감 첨부 저장소)와 이전 방식의 /uploads 경로를 모두 읽음
 * 이미 만든 문서를 다시 출력할 수 있어야 해서 이전 경로도 지원함
 * 권한은 PDF 를 만드는 쪽에서 이미 확인했으므로 여기서는 보지 않음
 * 실패하면 이미지 없이 PDF 를 만들 수 있도록 null 을 돌려줌
 */
export async function readImageForPdf(url: string | null | undefined): Promise<PdfImage | null> {
  // 민감 첨부 저장소
  const attId = attachmentIdOf(url);
  if (attId) {
    try {
      const att = await prisma.attachment.findUnique({
        where: { id: attId },
        select: { storedName: true, kind: true },
      });
      // 서명·직인 자리에 신분증·통장사본이 얹히지 않도록 종류를 제한함
      if (!att || (att.kind !== "SIGNATURE" && att.kind !== "SEAL")) return null;
      const format = imageFormat(att.storedName);
      if (!format) return null; // PDF·WebP 는 @react-pdf/renderer 가 못 얹음
      return { data: await readAttachmentFile(att.storedName), format };
    } catch {
      return null;
    }
  }

  // 이전 방식: public/uploads
  const filePath = resolveUploadPath(url);
  if (!filePath) return null;
  const format = imageFormat(filePath);
  if (!format) return null;
  try {
    const data = await readFile(filePath);
    return { data, format };
  } catch {
    return null;
  }
}
