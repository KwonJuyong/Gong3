"use client";

import { useState } from "react";
import { ui } from "@/app/components/ui";
import ConfirmButton from "@/app/components/ConfirmButton";
import SubmitButton from "@/app/components/SubmitButton";
import { freezeVersionAction, saveReviewAction } from "../actions";

type Question = { id: string; label: string; text: string };

export default function DraftEditor({ questions, serviceId, versionId, stamp }: {
  questions: Question[]; serviceId: string; versionId: string; stamp: string;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const dirty = questions.some(q => (edits[q.id] ?? q.text) !== q.text);
  return (
    <form action={saveReviewAction}>
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="stamp" value={stamp} />
      <input type="hidden" name="allowUnapproved" value="on" />
      <ol className="divide-y divide-[var(--gray-100)]">
        {questions.map((q, index) => {
          const value = edits[q.id] ?? q.text;
          return <li key={q.id} className="py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-[var(--muted)]">{index + 1}. {q.label}</span>
              <button type="button" aria-expanded={editing === q.id} onClick={() => setEditing(editing === q.id ? null : q.id)} className="text-sm font-medium text-[var(--accent)]">{editing === q.id ? "접기" : "수정"}</button>
            </div>
            {editing === q.id ? (
              <textarea autoFocus aria-label={q.label + " 문항 수정"} required rows={2} name={q.id} value={value}
                onChange={e => setEdits({ ...edits, [q.id]: e.target.value })}
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--gray-300)] p-3 text-[15px]" />
            ) : <>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">{value || "문항을 입력해 주세요."}</p>
              <input type="hidden" name={q.id} value={value} />
            </>}
          </li>;
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gray-200)] pt-4">
        <p className="text-sm text-[var(--muted)]">{dirty ? "수정한 문항을 함께 저장해 주세요." : "문항을 확정하면 모집 일정과 비용 처리를 정할 수 있어요."}</p>
        {dirty ? <SubmitButton disabled={questions.some(q => !(edits[q.id] ?? q.text).trim())} className={ui.primary}>수정한 문항 저장</SubmitButton> :
          <ConfirmButton formAction={freezeVersionAction} confirmLabel="문항 확정" message="화면에 표시된 모든 문항을 이 회차의 설문으로 확정할까요? 확정 후 문구를 수정할 수 없어요." className={ui.primary}>확정하고 다음: 모집·비용</ConfirmButton>}
      </div>
    </form>
  );
}
