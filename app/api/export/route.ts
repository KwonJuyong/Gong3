import { logPersonalData } from "@/app/lib/accessLog";
import { type NextRequest, NextResponse } from "next/server";
import { prisma, getSessionUser } from "../../db";
import { questionKey, commentKey } from "../../lib/projectQuestions";

function csvEscape(v: any) {
  const s =
    v === null || v === undefined
      ? ""
      : Array.isArray(v)
        ? v.join(" | ")
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);

  const needsQuote = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

function safeFileName(name: string) {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function friendlyType(type: string | undefined): string {
  switch (type) {
    case "text":
      return "서술형";
    case "radio":
      return "단일선택";
    case "checkbox":
      return "복수선택";
    case "rating":
      return "점수";
    case "likert5":
      return "동의척도";
    case "semantic7":
      return "의미변별";
    case "image":
      return "이미지";
    default:
      return "응답";
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        responses: {
          orderBy: { createdAt: "asc" },
          include: { user: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "project not found" },
        { status: 404 },
      );
    }

    // 내보내기 권한 확인: 생성자 또는 ADMIN만 가능
    if (me.role !== "ADMIN" && project.creatorId !== me.id) {
      return NextResponse.json(
        { error: "내보내기 권한이 없습니다. 관리자에게 문의하세요." },
        { status: 403 },
      );
    }

    const questions: any[] = Array.isArray(project.questions)
      ? (project.questions as any[])
      : [];

    const origin = process.env.SITE_URL || "https://evalia.co.kr";

    // 문항 → CSV 열. 응답 키는 제출·리포트와 같은 questionKey() 로 만든다.
    // 서술형 개선 의견은 text:<itemKey> 로 따로 저장되므로 열을 따로 낸다.
    const columns: { header: string; read: (a: any) => any }[] = [];

    questions.forEach((q, i) => {
      const label = q?.label || `${friendlyType(q?.type)} ${i + 1}`;
      const key = questionKey(q, i);

      columns.push({
        header: label,
        read: (answers) => {
          const val = answers?.[key];
          if (
            q?.type === "image" &&
            typeof val === "string" &&
            (val.startsWith("/uploads/") || val.startsWith("/api/uploads/"))
          ) {
            const normalized = val.startsWith("/uploads/")
              ? val.replace("/uploads/", "/api/uploads/")
              : val;
            return `${origin}${normalized}`;
          }
          if (q?.type === "rating" && val !== null && val !== undefined) {
            return `${val}점`;
          }
          return val;
        },
      });

      if (q?.itemKey && q?.comment) {
        columns.push({
          header: `${label} (개선 의견)`,
          read: (answers) => answers?.[commentKey(q.itemKey)],
        });
      }
    });

    const headers = ["제출일시", "학번", "평가자", ...columns.map((c) => c.header)];

    const rows: string[] = [];
    rows.push(headers.map(csvEscape).join(","));

    for (const r of project.responses) {
      const answers = (r.answers ?? {}) as any;

      const row = [
        new Date(r.createdAt).toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Seoul",
        }),
        r.user?.studentId ?? "",
        r.user?.name ?? "",
        ...columns.map((c) => c.read(answers)),
      ].map(csvEscape);

      rows.push(row.join(","));
    }

    const csv = "\uFEFF" + rows.join("\r\n");
    // 접속기록: 응답자 이름·학번이 담긴 파일 출력
    await logPersonalData(me.id, "EXPORT", `평가 결과(응답자 명단) ${project.title}`);
    const filename = `${safeFileName(project.title)}_결과.csv`;
    const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export] CSV 생성 실패:", err);
    return NextResponse.json(
      { error: "CSV 내보내기 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
