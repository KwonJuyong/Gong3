import { logPersonalData } from "@/app/lib/accessLog";
/**
 * 월별 원천징수 명세 (CSV). 신고가 월 단위이므로 지급일(Payout.paidAt) 기준으로 모은다.
 *
 * 홈택스 변환제출 규격은 아니고, 홈택스 서식에 옮겨 적기 위한 형태다.
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

/** KST 기준 그 달의 시작·끝(다음 달 시작)을 UTC 인스턴트로. 한국은 서머타임이 없다. */
function kstMonthRange(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1) - 9 * 3600_000),
    lt: new Date(Date.UTC(year, month, 1) - 9 * 3600_000),
  };
}

const ymd = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(d)
    : "";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const year = Number.parseInt(sp.get("year") ?? "", 10);
  const month = Number.parseInt(sp.get("month") ?? "", 10);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "year 가 올바르지 않습니다." }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "month 가 올바르지 않습니다." }, { status: 400 });
  }

  const { gte, lt } = kstMonthRange(year, month);
  const payouts = await prisma.payout.findMany({
    where: { status: "PAID", paidAt: { gte, lt } },
    include: {
      reward: {
        include: {
          order: { select: { orderNo: true } },
          user: {
            select: { name: true, payrollProfile: { select: { rrnEnc: true, address: true } } },
          },
        },
      },
    },
    orderBy: { paidAt: "asc" },
  });

  const header = [
    "지급일",
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
    "발주번호",
    "검증",
  ];
  const lines = [header.map(csvCell).join(",")];

  // 합계는 홈택스 원천세 신고서에 그대로 옮겨 적는 값이라 마지막 줄에 붙인다.
  let sumGross = 0;
  let sumIncomeTax = 0;
  let sumLocalTax = 0;
  let sumNet = 0;

  for (const p of payouts) {
    const r = p.reward;
    // 신고액은 실제 지급액이므로 재계산하지 않고 지급 시점 값을 쓴다.
    const w = withholdingForReport(r);
    sumGross += w.gross;
    sumIncomeTax += w.incomeTax;
    sumLocalTax += w.localTax;
    sumNet += w.netAmount;

    lines.push(
      [
        ymd(p.paidAt),
        r.user.name,
        decryptRRN(r.user.payrollProfile?.rrnEnc),
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
        r.order.orderNo,
        w.mismatch ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  lines.push(
    [
      "합계",
      `${payouts.length}건`,
      "",
      "",
      "",
      sumGross,
      "",
      "",
      sumIncomeTax,
      sumLocalTax,
      sumIncomeTax + sumLocalTax,
      sumNet,
      "",
      "",
      "",
    ]
      .map(csvCell)
      .join(","),
  );

  const csv = "﻿" + lines.join("\r\n"); // BOM — 엑셀 한글 깨짐 방지

  // 접속기록: 주민등록번호가 담긴 파일 출력
  await logPersonalData(me.id, "EXPORT", `월별 원천징수 명세(주민번호) ${year}-${String(month).padStart(2, "0")}`);
  const filename = `원천징수명세_${year}-${String(month).padStart(2, "0")}.csv`;
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
