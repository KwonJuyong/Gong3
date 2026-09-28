"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { uploadSensitiveImage } from "@/app/lib/uploadSensitive";

import { useState } from "react";
import { saveDirectorSignature } from "./actions";

export default function DirectorSignForm({
  initialUrl,
  saved,
}: {
  initialUrl: string;
  saved: boolean;
}) {
  const [signatureUrl, setSignatureUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      // 서명은 공개 업로드 경로가 아니라 민감 첨부 저장소에 올린다.
      const r = await uploadSensitiveImage(file, "SIGNATURE");
      if (!r.ok) setError(r.error);
      else setSignatureUrl(r.url);
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">연구책임자 서명 (전역)</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        여기서 설정한 단일 서명이 모든 노무비 청구 확인서의 근무확인(연구책임자) 칸에 자동 적용됩니다.
      </p>

      {saved && (
        <div className="mb-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">
          연구책임자 서명이 저장되었습니다.
        </div>
      )}

      <form action={saveDirectorSignature} className="flex items-center gap-4 flex-wrap">
        <input type="hidden" name="directorSignUrl" value={signatureUrl} />
        {signatureUrl ? (
          <img
            src={signatureUrl}
            alt="연구책임자 서명"
            className="w-28 h-14 object-contain rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white"
          />
        ) : (
          <div className="w-28 h-14 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-500)] text-xs">
            없음
          </div>
        )}
        <div className="space-y-1.5">
          <label className="inline-flex cursor-pointer items-center px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-dark)]">
            파일 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />
          </label>
          {uploading && <p className="text-xs text-[var(--muted)]">업로드 중…</p>}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          {signatureUrl && (
            <button
              type="button"
              onClick={() => setSignatureUrl("")}
              className="block text-xs text-[var(--danger)] hover:underline"
            >
              제거
            </button>
          )}
        </div>
        <SubmitButton className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--gray-100)]">
          서명 저장
        </SubmitButton>
      </form>
    </section>
  );
}
