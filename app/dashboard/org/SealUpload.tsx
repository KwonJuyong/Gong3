"use client";
import { uploadSensitiveImage } from "@/app/lib/uploadSensitive";

import { useRef, useState } from "react";

/**
 * 직인 이미지 업로드(견적서에 찍힘). URL 은 부모 폼의 hidden input 으로 함께 저장됨
 * 흰 배경이 찍히지 않도록 배경이 투명한 PNG 를 권함
 */
export default function SealUpload({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      // 직인도 민감 첨부 저장소에 올림
      const r = await uploadSensitiveImage(file, "SEAL");
      if (!r.ok) setError(r.error);
      else setUrl(r.url);
    } catch {
      setError("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span className="block text-xs font-medium text-[var(--gray-600)] mb-1">
        직인 (선택)
      </span>
      <input type="hidden" name="sealUrl" value={url} />

      <div className="flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="직인"
            className="w-20 h-20 object-contain rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white"
          />
        ) : (
          <div className="w-20 h-20 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] flex items-center justify-center text-xs text-[var(--gray-500)]">
            없음
          </div>
        )}
        <div className="space-y-1.5 min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {url ? "직인 변경" : "직인 이미지 업로드"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="block text-xs text-[var(--danger)] hover:underline"
            >
              제거
            </button>
          )}
          {uploading && <p className="text-xs text-[var(--muted)]">업로드 중…</p>}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          <p className="text-xs text-[var(--gray-500)] leading-snug">
            배경이 투명한 <strong>PNG</strong>를 권장합니다. JPG는 흰 사각형이 그대로 찍힙니다.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}
