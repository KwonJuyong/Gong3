import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { checkRateLimit } from "@/app/rate-limit";
import { checkUploadQuota } from "@/app/lib/uploadGuard";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// 파일 시그니처(매직넘버)로 판정한 확장자. 이미지가 아니면 null.
// 확장자를 파일명에서 가져오면 이미지 머리에 HTML 을 붙인 파일이 .html 로 저장돼 정적 서빙됨
function imageExt(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "jpg";
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  // WebP: RIFF....WEBP
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "webp";
  return null;
}

export async function POST(request: Request) {
  try {
    // 인증 확인
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // formData() 는 본문 전체를 메모리에 올리므로 크기를 먼저 봄
    const declared = Number(request.headers.get("content-length") ?? "");
    if (!Number.isFinite(declared) || declared > MAX_SIZE + 64 * 1024) {
      return NextResponse.json({ error: "파일 크기는 5MB 이하만 가능합니다." }, { status: 413 });
    }
    const rl = checkRateLimit(`upload:${userId}`, 30, 10 * 60 * 1000);
    if (rl) return NextResponse.json({ error: rl }, { status: 429 });
    const quotaErr = await checkUploadQuota(userId, "image", declared);
    if (quotaErr) return NextResponse.json({ error: quotaErr }, { status: 429 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "허용되지 않는 파일 형식입니다. (PNG, JPG, GIF, WebP만 가능)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 5MB 이하만 가능합니다." },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());

    const ext = imageExt(buffer);
    if (!ext) {
      return NextResponse.json(
        { error: "유효한 이미지 파일이 아닙니다." },
        { status: 400 }
      );
    }
    const filename = `${crypto.randomUUID()}.${ext}`;

    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ url: `/api/uploads/${filename}` });
  } catch {
    return NextResponse.json(
      { error: "업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
