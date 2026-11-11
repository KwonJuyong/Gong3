"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { useState, useMemo } from "react";
import { createClaimBatch } from "./actions";

type FinishedProject = {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
};

export default function ClaimBatchForm({ projects }: { projects: FinishedProject[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FinishedProject | null>(null);
  const [rate, setRate] = useState(0);

  const filtered = useMemo(
    () =>
      query.trim()
        ? projects.filter((p) =>
            p.title.toLowerCase().includes(query.trim().toLowerCase())
          )
        : projects,
    [projects, query]
  );

  function pick(p: FinishedProject) {
    setSelected(p);
    setQuery(p.title);
  }

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">청구 회차 생성</h3>

      <div className="space-y-1">
        <label className="text-xs text-[var(--muted)]">종료된 평가 검색</label>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="평가명으로 검색..."
          className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
        />

        {query.trim() && !selected && (
          <div className="border border-[var(--gray-200)] rounded-[var(--radius-md)] divide-y divide-[var(--gray-100)] max-h-52 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--gray-500)] text-center py-3">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface)] transition-colors"
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">{p.title}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {p.startDate} ~ {p.endDate}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2.5 text-sm">
          <p className="font-medium text-[var(--foreground)]">{selected.title}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            근무기간: {selected.startDate} ~ {selected.endDate}
          </p>
        </div>
      )}

      {selected && (
        <form action={createClaimBatch} className="flex items-end gap-3">
          <input type="hidden" name="title" value={selected.title} />
          <input type="hidden" name="periodStart" value={selected.startDate} />
          <input type="hidden" name="periodEnd" value={selected.endDate} />

          <label className="flex-1 text-xs text-[var(--muted)]">
            기본 일일노무비 (원)
            <input
              type="number"
              name="defaultRate"
              min={0}
              value={rate}
              onChange={(e) => setRate(parseInt(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm"
            />
          </label>

          <SubmitButton className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] shrink-0">
            회차 생성
          </SubmitButton>
        </form>
      )}

      {!selected && projects.length === 0 && (
        <p className="text-sm text-[var(--gray-500)] py-2">종료된 평가가 없습니다.</p>
      )}
    </section>
  );
}
