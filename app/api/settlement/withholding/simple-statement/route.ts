import { logPersonalData } from "@/app/lib/accessLog";
/**
 * 간이지급명세서(거주자의 기타소득) — 국세청 일괄등록 양식(.xlsx) 다운로드와 사전 점검.
 * 홈택스 「직접작성 제출」 화면의 [엑셀서식작성] 에 올리는 파일이다.
 *
 * - `?year=&month=&check=1` → 집계·경고를 JSON 으로 (다운로드 전에 화면이 먼저 부른다)
 * - `?year=&month=`         → .xlsx 다운로드
 *
 * 주민등록번호가 들어가므로 ADMIN 전용이고 다운로드는 AuditLog 에 남긴다. 서버에 저장하지 않는다.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { prisma } from "@/app/db";
import {
  simpleStatementRows,
  INCOME_CODE_PERSONAL_SERVICE,
  type SimpleStatementResult,
} from "@/app/lib/simpleStatement";
import { fillTemplateSheet1, type CellValue } from "@/app/lib/xlsxTemplate";

const TEMPLATE = "app/lib/templates/simple-statement-other-income-2024.xlsx";

/** 집계 결과를 양식의 A~N 14열로 편다. 순서는 양식 헤더 그대로. */
function toSheetRows(result: SimpleStatementResult): CellValue[][] {
  return result.rows.map((r, i) => [
    i + 1, // A 일련번호
    String(result.year), // B 귀속연도
    String(result.month).padStart(2, "0"), // C 귀속월 — 문자열 2자리 ('7' 이면 형식 오류)
    INCOME_CODE_PERSONAL_SERVICE, // D 소득구분 (76)
    r.name, // E 소득자성명
    r.rrn, // F 주민등록번호 — 13자리, 하이픈 없이
    "1", // G 내외국인 (내국인)
    r.entryCount, // H 지급건수
    r.grossAmount, // I 지급액
    r.necessaryExpense, // J 필요경비 (올림 — simpleStatement.ts 주석)
    r.incomeAmount, // K 소득금액
    20, // L 세율 (20 이 아니면 오류)
    r.incomeTax, // M 소득세
    r.localTax, // N 지방소득세
  ]);
}

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

  const result = await simpleStatementRows(year, month);

  // 사전 점검: 주민번호 미등록자 등을 다운로드 전에 보여준다.
  if (sp.get("check") === "1") {
    return NextResponse.json(
      {
        year,
        month,
        totals: result.totals,
        blockers: result.blockers,
        warnings: result.warnings,
        missingRrn: result.missingRrn.map((m) => ({ name: m.name, grossAmount: m.grossAmount })),
        ready: result.blockers.length === 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (result.blockers.length > 0) {
    return NextResponse.json({ error: result.blockers.join("\n") }, { status: 400 });
  }

  const xlsx = fillTemplateSheet1(TEMPLATE, toSheetRows(result));

  // 고유식별정보 반출 기록. 기록에 실패해도 다운로드는 막지 않는다.
  try {
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        targetId: me.id, // 특정 대상이 아니라 월 단위 집계다
        action: "TAX_EXPORT",
        summary:
          `간이지급명세서 ${year}-${String(month).padStart(2, "0")} · ` +
          `${result.totals.headcount}명 · ${result.totals.grossAmount.toLocaleString("ko-KR")}원 (주민번호 포함)`,
      },
    });
  } catch {
    // 기록 실패는 삼킨다 — 감사로그 때문에 신고 자료를 못 받으면 본말전도다.
  }

  // 접속기록: 주민등록번호가 담긴 파일 출력
  await logPersonalData(me.id, "EXPORT", `간이지급명세서(주민번호) ${year}-${String(month).padStart(2, "0")}`);
  const filename = `간이지급명세서_기타소득_${year}-${String(month).padStart(2, "0")}.xlsx`;
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(Buffer.from(xlsx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
