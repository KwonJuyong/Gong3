import { logPersonalData } from "@/app/lib/accessLog";
/**
 * 이체 목록 (CSV): 아직 보내지 않았거나(PENDING) 실패한(FAILED) 보상의 실지급액.
 *
 * 은행 대량이체 양식이 아니라 대조·기록용임. 이체는 정산 화면에서 건별로 함
 * 주민번호는 넣지 않음(원천징수 신고용은 /api/settlement/withholding).
 */
import { type NextRequest, NextResponse } from "next/server";
import { checkLimit } from "@/app/lib/limits";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "../../../../db";
import { listPayoutRows } from "../../../../lib/rewards";
import { csvCell } from "../../../../lib/csv";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const rl = checkLimit("adminDocument", me.id);
  if (rl) return NextResponse.json({ error: rl }, { status: 429 });

  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { service: true } });
  if (!order) return NextResponse.json({ error: "의뢰 없음" }, { status: 404 });

  const rows = await listPayoutRows(orderId);

  const header = ["은행", "계좌번호", "예금주", "실지급액", "적요", "상태", "실패사유"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.bankName,
        // 하이픈이 남아 있는 예전 입력분이 있어 여기서도 숫자만 남김
        r.accountNumber.replace(/[^0-9]/g, ""),
        r.holderName,
        r.amount,
        `${order.orderNo} 평가보상`,
        r.status === "FAILED" ? "재이체 필요" : "미이체",
        r.failReason,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM: 엑셀 한글 깨짐 방지

  // 접속기록: 계좌번호가 담긴 파일 출력
  await logPersonalData(me.id, "EXPORT", `이체 목록(계좌) ${order.orderNo}`);
  const filename = `이체목록_${order.orderNo}.csv`;
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
