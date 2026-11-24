"use client";

import { useRef, useState } from "react";
import Icon from "@/app/components/Icon";
import { ui } from "@/app/components/ui";
import {
  MAX_PROJECT_GUIDES,
  guideDownloadUrl,
  guideViewUrl,
  isPreviewableGuide,
  normalizeUploadFile,
  type ProjectGuide,
} from "@/app/lib/projectGuides";

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,.pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.md,.zip";

/** 평가 생성·수정 화면의 참고자료·매뉴얼 업로드(드래그 앤 드롭·복붙·선택 지원) */
export function ProjectGuidesInput({
  defaultValue = [],
  readOnly = false,
  name = "guides",
}: {
  defaultValue?: ProjectGuide[];
  readOnly?: boolean;
  name?: string;
}) {
  const [items, setItems] = useState<ProjectGuide[]>(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(rawFiles: FileList | File[] | null) {
    if (!rawFiles || rawFiles.length === 0 || readOnly) return;
    const remain = MAX_PROJECT_GUIDES - items.length;
    if (remain <= 0) {
      setNotice(`참고자료는 최대 ${MAX_PROJECT_GUIDES}개까지 올릴 수 있어요.`);
      return;
    }
    const list = Array.from(rawFiles).slice(0, remain);
    setUploading(true);
    setNotice("");
    const added: ProjectGuide[] = [];
    for (const raw of list) {
      const file = normalizeUploadFile(raw);
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await fetch("/api/messages/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) {
          added.push({
            url: String(data.url),
            name: String(data.name || file.name),
            kind: data.kind === "image" ? "image" : "file",
          });
        } else {
          setNotice(data.error || `‘${file.name}’을 올리지 못했어요.`);
        }
      } catch {
        setNotice(`‘${file.name}’을 올리지 못했어요.`);
      }
    }
    if (added.length) {
      setItems((prev) => [...prev, ...added].slice(0, MAX_PROJECT_GUIDES));
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={ui.label}>참고자료 · 매뉴얼 (선택)</span>
        <span className="text-xs text-[var(--muted)] tabular-nums">
          {items.length}/{MAX_PROJECT_GUIDES}
        </span>
      </div>
      {!readOnly && <input type="hidden" name={name} value={JSON.stringify(items)} />}

      {!readOnly ? (
        <div
          role="region"
          aria-label="참고자료 첨부 영역"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(e.dataTransfer.files);
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          className={`rounded-[var(--radius-md)] border border-dashed px-4 py-4 transition-colors ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent-light)]/40"
              : "border-[var(--gray-300)] bg-[var(--surface)]"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--muted)]">
              PDF · HWP · 문서 · 이미지를 끌어다 놓거나 붙여넣으세요 (최대 20MB)
            </p>
            <button
              type="button"
              disabled={uploading || items.length >= MAX_PROJECT_GUIDES}
              onClick={() => fileRef.current?.click()}
              className={`${ui.secondarySm} disabled:opacity-40`}
            >
              <Icon name="attach" size={14} className="mr-1.5" />
              {uploading ? "올리는 중…" : "파일 선택"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          승인된 평가의 참고자료는 관리자에게 변경을 요청해 주세요.
        </p>
      )}

      {notice && (
        <p role="status" className="text-sm text-[var(--danger)]">
          {notice}
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-[var(--gray-100)] rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-white">
          {items.map((g, i) => (
            <li key={g.url} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <a
                href={guideViewUrl(g)}
                target={isPreviewableGuide(g) ? "_blank" : undefined}
                rel={isPreviewableGuide(g) ? "noreferrer" : undefined}
                className="min-w-0 flex-1 truncate font-medium text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
              >
                {g.name}
              </a>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`${g.name} 삭제`}
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  className={ui.textButton}
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 학생·관리자 화면의 참고자료·매뉴얼 목록(PDF·이미지는 미리보기 + 내려받기, 기타 문서는 내려받기) */
export function ProjectGuidesList({
  guides,
  title = "참고자료 · 매뉴얼",
}: {
  guides?: ProjectGuide[] | null;
  title?: string;
}) {
  if (!guides || guides.length === 0) return null;

  return (
    <section aria-label={title} className="rounded-[var(--radius-lg)] bg-[var(--surface)] px-4 py-3.5 space-y-2">
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      <ul className="divide-y divide-[var(--gray-200)]/70">
        {guides.map((g) => {
          const preview = isPreviewableGuide(g);
          return (
            <li key={g.url} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <a
                href={preview ? guideViewUrl(g) : guideDownloadUrl(g)}
                target={preview ? "_blank" : undefined}
                rel={preview ? "noreferrer" : undefined}
                className="min-w-0 flex-1 inline-flex items-center gap-2 text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
              >
                <Icon name={preview ? "file" : "download"} size={15} className="shrink-0 text-[var(--muted)]" />
                <span className="truncate">{g.name}</span>
              </a>
              <div className="flex items-center gap-3 shrink-0 text-sm">
                {preview && (
                  <a
                    href={guideViewUrl(g)}
                    target="_blank"
                    rel="noreferrer"
                    className={ui.link}
                  >
                    미리보기
                  </a>
                )}
                <a href={guideDownloadUrl(g)} className={ui.link}>
                  내려받기
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
