"use client";

import { confirmDialog } from "@/app/components/feedback";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 신분증·통장사본 첨부(노무비 서류용). 평가 보상에는 필요 없어 노무비 화면에만 둔다.
 * 파일은 public/ 밖에 저장되고 /api/attachments/[id] 로만 열린다.
 */

export interface AttachmentView {
  id: string;
  kind: "ID_CARD" | "BANKBOOK";
  origName: string;
  mime: string;
  size: number;
  createdAt: string;
}

const KIND_LABEL: Record<AttachmentView["kind"], string> = {
  ID_CARD: "신분증",
  BANKBOOK: "통장사본",
};

const KIND_HINT: Record<AttachmentView["kind"], string> = {
  ID_CARD: "주민등록증·운전면허증·학생증 중 하나",
  BANKBOOK: "계좌번호와 예금주가 보이는 면",
};

const KINDS: AttachmentView["kind"][] = ["ID_CARD", "BANKBOOK"];

function fmtSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`;
}

export default function AttachmentsPanel({ initial }: { initial: AttachmentView[] }) {
  const router = useRouter();
  const [items, setItems] = useState<AttachmentView[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(kind: AttachmentView["kind"], file: File) {
    setBusy(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "업로드에 실패했습니다.");
        return;
      }
      // 같은 종류는 한 벌만 두고 교체한다.
      setItems((prev) => [...prev.filter((a) => a.kind !== kind), json.attachment]);
      router.refresh();
    } catch {
      setError("업로드에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(att: AttachmentView) {
    if (!(await confirmDialog({ message: `${KIND_LABEL[att.kind]}을(를) 삭제합니다.\n\n정말 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true }))) return;
    setBusy(att.kind);
    setError(null);
    try {
      const res = await fetch(`/api/attachments/${att.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("삭제에 실패했습니다.");
        return;
      }
      setItems((prev) => prev.filter((a) => a.id !== att.id));
      router.refresh();
    } catch {
      setError("삭제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">서류 첨부</h3>
      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
        노무비 청구에 함께 제출하는 서류입니다. 이미지(PNG·JPG·WebP) 또는 PDF, 10MB 이하.
      </p>

      <div className="mt-4 space-y-2">
        {KINDS.map((kind) => {
          const att = items.find((a) => a.kind === kind);
          const loading = busy === kind;
          return (
            <div
              key={kind}
              className="flex items-center justify-between gap-3 flex-wrap rounded-[var(--radius-md)] bg-[var(--surface)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--foreground)]">
                  {att ? "✓ " : ""}
                  {KIND_LABEL[kind]}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5 truncate">
                  {att
                    ? `${att.origName} · ${fmtSize(att.size)}`
                    : KIND_HINT[kind]}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {att && (
                  <a
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-white"
                  >
                    보기
                  </a>
                )}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => inputs.current[kind]?.click()}
                  className="px-2.5 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-white disabled:opacity-40"
                >
                  {loading ? "올리는 중…" : att ? "다시 올리기" : "올리기"}
                </button>
                {att && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => remove(att)}
                    className="px-2.5 py-1.5 text-xs font-medium text-[var(--warning)] rounded-[var(--radius-md)] hover:bg-[var(--warning-light)] disabled:opacity-40"
                  >
                    삭제
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputs.current[kind] = el;
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = ""; // 같은 파일 다시 고를 수 있게
                    if (f) upload(kind, f);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-[var(--warning)] mt-3">{error}</p>}

      <p className="text-xs text-[var(--gray-500)] mt-3 leading-relaxed">
        본인과 관리자만 열람할 수 있습니다. 링크만으로는 열리지 않습니다.
        <br />
        같은 종류를 다시 올리면 이전 파일은 <strong>교체·삭제</strong>됩니다.
      </p>
    </section>
  );
}
