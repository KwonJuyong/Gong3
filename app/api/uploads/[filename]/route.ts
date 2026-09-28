import { type NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSessionUserId } from "@/app/session-server";

// 이미지: 인라인 렌더 허용
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// 문서/일반 파일: 다운로드 강제 (인라인 실행 위험 차단)
const FILE_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  md: "text/markdown",
  json: "application/json",
  log: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  hwp: "application/x-hwp",
  hwpx: "application/x-hwp",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 로그인 여부만 본다(파일 소유자는 기록돼 있지 않다). 존재를 드러내지 않도록 404.
  if (!(await getSessionUserId())) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // 경로 조작 방지
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const imageMime = IMAGE_MIME[ext];
  const fileMime = FILE_MIME[ext];
  if (!imageMime && !fileMime) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", filename);

  try {
    await stat(filePath);
    const buffer = await readFile(filePath);

    // 공유 프록시가 인증 없이 다시 내주지 않도록 private 캐시만 허용한다.
    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=31536000, immutable",
    };

    if (imageMime) {
      // 이미지는 인라인 렌더
      headers["Content-Type"] = imageMime;
    } else {
      // 문서/일반 파일은 강제 다운로드 (인라인 실행 차단)
      headers["Content-Type"] = fileMime;
      const rawName = req.nextUrl.searchParams.get("name") || filename;
      // 헤더 인젝션 방지: 제어문자 제거 후 RFC5987 인코딩
      const safeName = rawName.replace(/[\r\n"\\]/g, "").slice(0, 200);
      headers["Content-Disposition"] =
        `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`;
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
