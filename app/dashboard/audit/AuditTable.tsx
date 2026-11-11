"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { csvCell } from "@/app/lib/csv";

/** 감사 로그 목록. 차단 건은 색과 함께 "차단" 라벨로도 구분함 */

export type AuditRow = {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  question: string;
  tool: string;
  target: string | null;
  policy: string | null;
  outcome: string;
  reason: string | null;
  rowCount: number | null;
  durationMs: number;
};

const OUTCOME: Record<string, { label: string; cls: string }> = {
  SUCCESS: { label: "성공", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  BLOCKED: { label: "차단", cls: "bg-amber-50 text-amber-800 border-amber-300 font-semibold" },
  ERROR: { label: "오류", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function AuditTable({
  rows,
  total,
  page,
  perPage,
  counts,
  filters,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  perPage: number;
  counts: { SUCCESS: number; BLOCKED: number; ERROR: number };
  filters: { from: string; to: string; actor: string; outcome: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const go = (patch: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (!("page" in patch)) q.delete("page");
    router.push(`/dashboard/audit?${q.toString()}`);
  };

  const exportCsv = () => {
    const head = ["시각", "요청자", "역할", "질의", "도구", "접근대상", "정책", "결과", "사유", "건수", "소요(ms)"];
    const body = rows.map((r) =>
      [r.at, r.actor, r.actorRole, r.question, r.tool, r.target, r.policy,
       OUTCOME[r.outcome]?.label ?? r.outcome, r.reason, r.rowCount, r.durationMs].map(csvCell).join(","),
    );
    // BOM 을 붙여야 엑셀에서 한글이 안 깨짐
    const blob = new Blob(["﻿" + [head.join(","), ...body].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `감사로그_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 sm:px-6 py-8 max-w-[1100px] mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-[var(--foreground)]">AI 도우미 질의 감사 로그</h1>
        <p className="text-sm text-[var(--gray-500)] mt-1">
          도우미가 실행한 모든 데이터 조회를 기록합니다. 차단된 질의도 남습니다.
          질의 원문의 주민등록번호·계좌번호·비밀번호는 저장 시점에 지워집니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <span className="px-2 py-1 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
          성공 {counts.SUCCESS.toLocaleString()}
        </span>
        <span className="px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-300">
          차단 {counts.BLOCKED.toLocaleString()}
        </span>
        <span className="px-2 py-1 rounded border bg-rose-50 text-rose-700 border-rose-200">
          오류 {counts.ERROR.toLocaleString()}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--gray-200)] text-[var(--gray-600)]">
          전체 {total.toLocaleString()}
        </span>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded-lg border border-[var(--gray-200)] bg-[var(--gray-50)]"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          go({
            from: String(f.get("from") || ""),
            to: String(f.get("to") || ""),
            actor: String(f.get("actor") || ""),
            outcome: String(f.get("outcome") || ""),
          });
        }}
      >
        <label className="text-xs">
          <span className="block mb-1 text-[var(--gray-600)]">시작일</span>
          <input type="date" name="from" defaultValue={filters.from} className="border rounded px-2 py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-[var(--gray-600)]">종료일</span>
          <input type="date" name="to" defaultValue={filters.to} className="border rounded px-2 py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-[var(--gray-600)]">요청자 (이름·학번)</span>
          <input name="actor" defaultValue={filters.actor} placeholder="김철수 또는 20241234"
                 className="border rounded px-2 py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-[var(--gray-600)]">처리 결과</span>
          <select name="outcome" defaultValue={filters.outcome} className="border rounded px-2 py-1 text-sm">
            <option value="">전체</option>
            <option value="SUCCESS">성공</option>
            <option value="BLOCKED">차단</option>
            <option value="ERROR">오류</option>
          </select>
        </label>
        <button type="submit" className="px-3 py-1.5 rounded bg-[var(--primary)] text-white text-sm">
          검색
        </button>
        <button type="button" onClick={() => go({ from: "", to: "", actor: "", outcome: "" })}
                className="px-3 py-1.5 rounded border border-[var(--gray-300)] text-sm">
          초기화
        </button>
        <button type="button" onClick={exportCsv}
                className="px-3 py-1.5 rounded border border-[var(--gray-300)] text-sm ml-auto">
          이 페이지 내보내기 (CSV)
        </button>
      </form>

      <div className="overflow-x-auto border border-[var(--gray-200)] rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-[var(--gray-50)] text-[var(--gray-600)]">
            <tr>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">시각</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">요청자</th>
              <th className="text-left px-3 py-2 font-medium">질의</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">접근 대상</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">건수</th>
              <th className="text-center px-3 py-2 font-medium whitespace-nowrap">결과</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">소요</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[var(--gray-500)]">
                  조건에 맞는 기록이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const o = OUTCOME[r.outcome] ?? { label: r.outcome, cls: "" };
              const blocked = r.outcome === "BLOCKED";
              return (
                <tr
                  key={r.id}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className={`border-t border-[var(--gray-100)] cursor-pointer hover:bg-[var(--gray-50)] ${
                    blocked ? "bg-amber-50/60" : ""
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--gray-600)]">{r.at}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.actor}
                    <span className="ml-1 text-xs text-[var(--gray-500)]">{r.actorRole}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="line-clamp-1">{r.question || <span className="text-[var(--gray-500)]">(없음)</span>}</div>
                    {open === r.id && (
                      <div className="mt-2 p-2 rounded bg-white border border-[var(--gray-200)] text-xs space-y-1">
                        <div><b>질의 원문</b>: {r.question || "(없음)"}</div>
                        <div><b>도구</b>: {r.tool}</div>
                        <div><b>적용 정책</b>: {r.policy ?? "-"}</div>
                        {r.reason && <div className="text-amber-800"><b>사유</b>: {r.reason}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--gray-600)]">{r.target ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rowCount ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${o.cls}`}>{o.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--gray-500)]">{r.durationMs}ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm">
          <button disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}
                  className="px-3 py-1 rounded border border-[var(--gray-300)] disabled:opacity-40">
            이전
          </button>
          <span className="text-[var(--gray-600)]">
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => go({ page: String(page + 1) })}
                  className="px-3 py-1 rounded border border-[var(--gray-300)] disabled:opacity-40">
            다음
          </button>
        </div>
      )}
    </div>
  );
}
