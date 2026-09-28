import { logPersonalData } from "@/app/lib/accessLog";
/**
 * 발주별 원천징수 명세 (CSV) — 지급명세서·원천세 신고 근거자료.
 *
 * 신고는 실제 지급 기준이므로 기본은 PAID 만 내보낸다. ?all=1 이면 확인용으로 미지급분도 포함한다.
 * 주민등록번호가 들어가므로 ADMIN 전용이다.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "../../../../db";
import { decryptRRN } from "../../../../lib/crypto";
import { withholdingForReport, INCOME_TYPE_LABEL, type IncomeType } from "../../../../lib/withholding";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "발주 없음" }, { status: 404 });

  // 기본은 지급된 것만. ?all=1 이면 미지급분도 포함한다.
  const includeUnpaid = req.nextUrl.searchParams.get("all") === "1";
  const rewards = await prisma.reward.findMany({
    where: {
      orderId,
      status: includeUnpaid ? { in: ["APPROVED", "PAID", "FAILED"] } : "PAID",
    },
    include: {
      user: { select: { name: true, payrollProfile: { select: { rrnEnc: true, address: true } } } },
      payout: { select: { paidAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const ymd = (d: Date | null | undefined) =>
    d
      ? new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "Asia/Seoul",
        }).format(d)
      : "";

  const header = [
    "성명",
    "주민등록번호",
    "주소",
    "소득구분",
    "지급액(세전)",
    "필요경비",
    "소득금액",
    "소득세",
    "지방소득세",
    "원천징수계",
    "실지급액",
    "비과세",
    "지급여부",
    "지급일",
    "검증",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const r of rewards) {
    // 신고액은 실제 지급액이므로 재계산하지 않고 지급 시점 값을 쓴다.
    const w = withholdingForReport(r);
    const rrn = decryptRRN(r.user.payrollProfile?.rrnEnc);
    const paid = r.status === "PAID";
    lines.push(
      [
        r.user.name,
        rrn,
        r.user.payrollProfile?.address ?? "",
        INCOME_TYPE_LABEL[r.incomeType as IncomeType] ?? r.incomeType,
        w.gross,
        w.necessaryExpense,
        w.taxableAmount,
        w.incomeTax,
        w.localTax,
        w.taxAmount,
        w.netAmount,
        w.exempt ? `Y(${w.exemptReason})` : "",
        paid ? "지급" : r.status === "FAILED" ? "이체실패(미지급)" : "미지급",
        paid ? ymd(r.payout?.paidAt) : "",
        w.mismatch ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\r\n");

  // 접속기록: 주민등록번호가 담긴 파일 출력
  await logPersonalData(me.id, "EXPORT", `원천징수 명세(주민번호) ${order.orderNo}`);
  const filename = `원천징수명세_${order.orderNo}${includeUnpaid ? "_전체" : ""}.csv`;
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
