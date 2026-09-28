"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { useState } from "react";
import { saveDraftAction } from "../actions";

export default function DraftEditor({
  draft,
  constructName,
}: {
  draft: {
    id: string;
    generated: string;
    edited: string | null;
    approved: boolean;
    scaleType: string;
  };
  constructName: string;
}) {
  const [edited, setEdited] = useState(draft.edited ?? draft.generated);
  const [approved, setApproved] = useState(draft.approved);

  return (
    <form
      action={saveDraftAction}
      className="rounded-[var(--radius-md)] border border-[var(--gray-200)] p-4 space-y-2"
    >
      <input type="hidden" name="draftId" value={draft.id} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--foreground)]">{constructName}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {draft.scaleType === "LIKERT_5" ? "5점 동의척도" : draft.scaleType}
        </span>
      </div>

      <p className="text-xs text-[var(--gray-500)]">자동 생성 원문: {draft.generated}</p>

      <textarea
        name="edited"
        value={edited}
        onChange={(e) => setEdited(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--gray-900)]/10"
      />

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
          <input
            type="checkbox"
            name="approved"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          확정(승인)
        </label>
        <SubmitButton className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]">
          저장
        </SubmitButton>
      </div>
    </form>
  );
}
