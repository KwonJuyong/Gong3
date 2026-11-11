import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { checkRateLimit } from "@/app/rate-limit";
import { readUploadForm } from "@/app/lib/uploadForm";
import { checkUploadQuota } from "@/app/lib/uploadGuard";

export const runtime = "nodejs";

// 메시지 첨부 업로드. 이미지는 인라인 표시, 문서는 다운로드로 제공함

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

// 이미지: 매직넘버로 실제 검증 (인라인 렌더되므로 엄격)
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
// 문서/일반 파일: 확장자 화이트리스트 (다운로드 강제라 인라인 실행 위험 없음)
const FILE_EXT = new Set([
  "pdf", "txt", "csv", "tsv", "md", "json", "log",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
  "zip", "7z", "rar",
]);

function isValidImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true; // WebP
  return false;
}

export async function POST(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const rl = checkRateLimit(`msg-upload:${userId}`, 60, 10 * 60 * 1000);
    if (rl) return NextResponse.json({ error: rl }, { status: 429 });
    const upload = await readUploadForm(request, MAX_SIZE);
    if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });
    const quotaErr = await checkUploadQuota(userId, "message", upload.bytes);
    if (quotaErr) return NextResponse.json({ error: quotaErr }, { status: 429 });
    const formData = upload.form;
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 20MB 이하만 가능합니다." }, { status: 400 });
    }

    const origName = file.name || "file";
    const ext = (origName.split(".").pop() || "").toLowerCase();
    const isImage = IMAGE_EXT.has(ext);
    const isFile = FILE_EXT.has(ext);

    if (!isImage && !isFile) {
      return NextResponse.json(
        { error: "허용되지 않는 파일 형식입니다." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (isImage && !isValidImage(buffer)) {
      return NextResponse.json({ error: "유효한 이미지 파일이 아닙니다." }, { status: 400 });
    }

    const filename = `${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({
      url: `/api/uploads/${filename}`,
      name: origName,
      kind: isImage ? "image" : "file",
      size: file.size,
    });
  } catch {
    return NextResponse.json({ error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
