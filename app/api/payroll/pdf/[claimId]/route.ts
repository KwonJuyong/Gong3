import { logPersonalData } from "@/app/lib/accessLog";
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "../../../../db";
import { renderClaimPdfBuffer } from "../../../../dashboard/payroll/pdfData";

function safeFileName(name: string) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ claimId: string }> },
) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (!me || me.role !== "ADMIN") {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }
    const rl = checkLimit("adminDocument", me.id);
    if (rl) return NextResponse.json({ error: rl }, { status: 429 });

    const { claimId } = await params;
    const claim = await prisma.laborClaim.findUnique({
      where: { id: claimId },
      include: { user: { select: { studentId: true, name: true } } },
    });
    if (!claim) {
      return NextResponse.json({ error: "청구서를 찾을 수 없습니다." }, { status: 404 });
    }

    const pdf = await renderClaimPdfBuffer(claim);
    // 접속기록: 개인 청구서(주민번호·계좌) 출력
    await logPersonalData(me.id, "EXPORT", "노무비 청구서 PDF", claim.userId);
    const filename = `${safeFileName(`${claim.user?.studentId || ""}_${claim.user?.name || claim.name}`)}.pdf`;
    const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[payroll/pdf] 생성 실패:", err);
    return NextResponse.json({ error: "PDF 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
