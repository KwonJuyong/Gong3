"use client";

import { toast } from "@/app/components/feedback";
import { useActionState, useState } from "react";
import { askDataAction, type QueryState } from "./actions";
import QueryChart from "./QueryChart";

/**
 * 자연어 조회 화면. 질문과 결과(표·차트)를 함께 보여주고 Excel·PDF 로 내려받는다.
 * 결과가 없거나 권한으로 막히면 사유를 보여준다.
 * 내보내기는 화면의 행이 아니라 질의 명세(spec)를 보내 서버가 다시 실행한다.
 */

const EXAMPLES = [
  "전공별 인원 알려줘",
  "이번 달 응답 제출 추이 보여줘",
  "전공별·역할별 분포 교차분석",
  "참여 신청한 적 있는 회원 수",
  "진행중인 평가 목록",
];

const initial: QueryState = { ok: false };

export default function QueryConsole() {
  const [state, formAction, pending] = useActionState(askDataAction, initial);
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (format: "xlsx" | "csv" | "pdf") => {
    if (!state.spec) return;
    setDownloading(format);
    try {
      const res = await fetch("/api/query/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, question: state.question, spec: state.spec }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "내보내기에 실패했습니다." }));
        toast(j.error ?? "내보내기에 실패했습니다.", "error");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : `조회결과.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const hasData = state.ok && state.kind === "data";
  const empty = hasData && (state.rows?.length ?? 0) === 0;

  return (
    <div className="px-4 sm:px-6 py-8 max-w-[1100px] mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-[var(--foreground)]">데이터 조회</h1>
        <p className="text-sm text-[var(--gray-500)] mt-1">
          한국어로 물어보면 표와 차트로 답합니다. 조회 권한 범위 안에서만 결과가 나오고,
          모든 조회는 감사 로그에 기록됩니다.
        </p>
      </header>

      <form action={formAction} className="flex gap-2">
        <input
          name="question"
          defaultValue={state.question ?? ""}
          placeholder="예: 전공별 인원 알려줘"
          className="flex-1 border border-[var(--gray-300)] rounded-lg px-3 py-2 text-sm"
          maxLength={500}
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "조회 중…" : "조회"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {EXAMPLES.map((e) => (
          <form key={e} action={formAction}>
            <input type="hidden" name="question" value={e} />
            <button
              type="submit"
              disabled={pending}
              className="text-xs px-2 py-1 rounded-full border border-[var(--gray-200)] text-[var(--gray-600)] hover:bg-[var(--gray-50)] disabled:opacity-50"
            >
              {e}
            </button>
          </form>
        ))}
      </div>

      {/* 되묻기 */}
      {state.kind === "clarify" && (
        <div className="mt-5 p-4 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-900">
          <b className="block mb-1">조금 더 알려주세요</b>
          {state.message}
        </div>
      )}

      {/* 권한 차단 사유 */}
      {state.kind === "blocked" && (
        <div className="mt-5 p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          <b className="block mb-1">조회할 수 없습니다</b>
          {state.message}
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-5 p-4 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-800">
          <b className="block mb-1">오류</b>
          {state.message}
        </div>
      )}

      {hasData && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-sm text-[var(--gray-500)]">질문</div>
              <div className="font-medium">{state.question}</div>
            </div>
            {!empty && (
              <div className="flex gap-1.5">
                {(["xlsx", "csv", "pdf"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => download(f)}
                    disabled={downloading !== null}
                    className="px-3 py-1.5 rounded border border-[var(--gray-300)] text-sm disabled:opacity-50"
                  >
                    {downloading === f ? "생성 중…" : f === "xlsx" ? "Excel" : f.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {empty ? (
            <div className="p-6 rounded-lg border border-[var(--gray-200)] text-center text-sm text-[var(--gray-500)]">
              조건에 맞는 데이터가 없습니다. 조건을 바꿔 다시 물어보세요.
            </div>
          ) : (
            <>
              {/* 단일 값은 큰 숫자로 */}
              {(state.mode === "count" || state.mode === "aggregate") && state.rows?.length === 1 && (
                <div className="mb-4 p-6 rounded-lg border border-[var(--gray-200)] text-center">
                  <div className="text-sm text-[var(--gray-500)]">{state.columns?.[0]}</div>
                  <div className="text-4xl font-bold tabular-nums mt-1">
                    {Number(state.rows[0][state.columns![0]] ?? 0).toLocaleString()}
                  </div>
                </div>
              )}

              {/* 차트 */}
              {state.columns && state.rows && (
                <div className="mb-4 p-4 rounded-lg border border-[var(--gray-200)] bg-white overflow-x-auto">
                  <QueryChart mode={state.mode ?? ""} columns={state.columns} rows={state.rows} />
                </div>
              )}

              {/* 표 */}
              <div className="overflow-x-auto border border-[var(--gray-200)] rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--gray-50)] text-[var(--gray-600)]">
                    <tr>
                      {state.columns?.map((c) => (
                        <th key={c} className="text-left px-3 py-2 font-medium whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows?.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--gray-100)]">
                        {state.columns?.map((c) => (
                          <td key={c} className="px-3 py-2">
                            {r[c] === null || r[c] === undefined
                              ? ""
                              : typeof r[c] === "number"
                                ? (r[c] as number).toLocaleString()
                                : typeof r[c] === "boolean"
                                  ? ((r[c] as boolean) ? "예" : "아니오")
                                  : String(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 text-xs text-[var(--gray-500)]">
                {state.rowCount?.toLocaleString()}건
                {state.truncated && " · 상한에 걸려 일부만 표시했습니다"}
              </div>
            </>
          )}

          {state.notes?.map((n, i) => (
            <p key={i} className="mt-1.5 text-xs text-amber-700">※ {n}</p>
          ))}
        </section>
      )}
    </div>
  );
}
