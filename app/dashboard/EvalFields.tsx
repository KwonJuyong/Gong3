"use client";

import { useRef, useState } from "react";
import { LIKERT5_LABELS } from "../lib/projectQuestions";
import { toast } from "../components/feedback";

/* 응답 화면의 문항 입력 컴포넌트 */

/** 척도 버튼 공통 모양. 터치 대상은 36px 이상. */
const choiceCls = (active: boolean) =>
  `flex items-center justify-center text-center cursor-pointer select-none transition-colors ${
    active
      ? "bg-[var(--accent)] text-white font-semibold"
      : "bg-[var(--gray-100)] text-[var(--gray-700)] hover:bg-[var(--gray-200)]"
  }`;

/**
 * 5점 동의 척도(리커트). 진술문에 대한 동의 정도를 묻는 척도라 별점과 다르게 라벨을 보여줌
 * 5칸을 같은 폭으로 둠. 척도 방향이 기기마다 다르면 응답 분포가 달라지므로 좁은 화면에서도
 * 세로로 바꾸지 않음
 */
export function Likert5Field({ name, defaultValue, onPick }: { name: string; defaultValue?: number; onPick?: () => void }) {
  const [value, setValue] = useState<number>(defaultValue || 0);
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
      {LIKERT5_LABELS.map((label, i) => {
        const v = i + 1;
        return (
          <label key={v} className={`${choiceCls(value === v)} min-h-12 px-1 py-2 rounded-[var(--radius-md)] text-xs sm:text-[13px] leading-snug break-keep`}>
            {/* 수정 모드에서 기존 값이 실제로 선택되도록 defaultChecked 를 줌 */}
            <input
              type="radio"
              name={name}
              value={String(v)}
              defaultChecked={defaultValue === v}
              className="sr-only"
              onChange={() => {
                setValue(v);
                onPick?.();
              }}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

/**
 * 7점 의미변별 척도(UEQ 등 검증도구용). 1~7 을 그대로 보내고, 역문항 처리와 −3~+3 변환은
 * surveyScore.ts 가 함
 * 폰에서는 양 끝 형용사를 척도 위 한 줄에 두고 7칸을 폭에 맞춤
 */
export function Semantic7Field({
  name,
  left,
  right,
  defaultValue,
  onPick,
}: {
  name: string;
  left: string;
  right: string;
  defaultValue?: number;
  onPick?: () => void;
}) {
  const [value, setValue] = useState<number>(defaultValue || 0);
  return (
    <div className="sm:flex sm:items-center sm:gap-3">
      <div className="flex justify-between text-sm font-medium text-[var(--foreground)] mb-2 sm:hidden">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <span className="hidden sm:block text-sm font-medium text-[var(--foreground)] w-28 text-right shrink-0">{left}</span>
      <div className="grid grid-cols-7 gap-1 sm:flex sm:gap-1.5" role="radiogroup" aria-label={`${left}: ${right}`}>
        {[1, 2, 3, 4, 5, 6, 7].map((v) => (
          <label
            key={v}
            className={`${choiceCls(value === v)} h-11 sm:w-11 rounded-[var(--radius-md)] text-[15px]`}
            aria-label={`${v}점 (1 = ${left}, 7 = ${right})`}
          >
            <input
              type="radio"
              name={name}
              value={String(v)}
              defaultChecked={defaultValue === v}
              className="sr-only"
              onChange={() => {
                setValue(v);
                onPick?.();
              }}
            />
            {v}
          </label>
        ))}
      </div>
      <span className="hidden sm:block text-sm font-medium text-[var(--foreground)] w-28 shrink-0">{right}</span>
    </div>
  );
}

/**
 * 검증도구의 숫자 척도(1~7, 0~10 등). 원래 범위를 바꾸면 원척도와 비교할 수 없어 그대로 씀
 * 양 끝 라벨은 척도 위 한 줄에 두고, 좁은 화면에서도 가로 배열을 유지함
 */
export function ScaleField({
  name,
  min,
  max,
  left,
  right,
  defaultValue,
  onPick,
}: {
  name: string;
  min: number;
  max: number;
  left: string;
  right: string;
  defaultValue?: number;
  onPick?: () => void;
}) {
  const [value, setValue] = useState<number | undefined>(defaultValue);
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm font-medium text-[var(--foreground)] mb-2">
        <span>
          {min} = {left}
        </span>
        <span className="text-right">
          {max} = {right}
        </span>
      </div>
      <div
        className="grid gap-0.5 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={`${min} ${left}: ${max} ${right}`}
      >
        {points.map((v) => (
          <label key={v} className={`${choiceCls(value === v)} h-11 rounded-[var(--radius-md)] text-[15px]`} aria-label={`${v}점`}>
            <input
              type="radio"
              name={name}
              value={String(v)}
              defaultChecked={defaultValue === v}
              className="sr-only"
              onChange={() => {
                setValue(v);
                onPick?.();
              }}
            />
            {v}
          </label>
        ))}
      </div>
    </div>
  );
}

/** 별점 1~5. 선택한 점수까지 별을 채움 */
export function StarRating({ name, defaultValue, onPick }: { name: string; defaultValue?: number; onPick?: () => void }) {
  const [value, setValue] = useState<number>(defaultValue || 0);
  return (
    <div className="flex items-center gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((v) => (
        <label
          key={v}
          className={`w-11 h-11 flex items-center justify-center text-2xl cursor-pointer rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] ${
            value >= v ? "text-amber-500" : "text-[var(--gray-300)]"
          }`}
          aria-label={`${v}점`}
        >
          <input
            type="radio"
            name={name}
            value={String(v)}
            defaultChecked={defaultValue === v}
            className="sr-only"
            onChange={() => {
              setValue(v);
              onPick?.();
            }}
          />
          <span aria-hidden="true">★</span>
        </label>
      ))}
      <span className="text-sm text-[var(--muted)] ml-2 tabular-nums">{value > 0 ? `${value} / 5` : "선택 안 함"}</span>
    </div>
  );
}

export function ImageUploadField({
  name,
  defaultValue,
  onPick,
}: {
  name: string;
  /** 이미 제출한 이미지. 없으면 응답을 고쳐 다시 낼 때 이미지 답이 빈 값으로 덮임 */
  defaultValue?: string;
  onPick?: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(defaultValue || null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(defaultValue || "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("이미지 파일만 업로드할 수 있습니다.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("파일 크기는 5MB 이하만 가능합니다.", "error");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) {
        setUploadedUrl(data.url);
        setPreview(data.url);
        onPick?.();
      } else {
        toast(data.error || "업로드에 실패했습니다.", "error");
      }
    } catch {
      toast("업로드 중 오류가 발생했습니다.", "error");
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={uploadedUrl} />
      <div
        role="button"
        tabIndex={0}
        aria-label="이미지 업로드"
        className="border-2 border-dashed border-[var(--gray-300)] rounded-[var(--radius-lg)] p-6 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
        onClick={() => fileRef.current?.click()}
        // Enter·Space 로도 파일 선택을 열기
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) handleFile(file);
              break;
            }
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {uploading ? (
          <p className="text-sm text-[var(--muted)]">업로드 중…</p>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="올린 이미지 미리보기" className="max-h-48 mx-auto rounded-[var(--radius-md)]" />
        ) : (
          <div>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-[var(--gray-400)]" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <p className="text-sm text-[var(--gray-700)]">눌러서 선택하거나, 끌어다 놓거나, 붙여넣기</p>
            <p className="text-xs text-[var(--muted)] mt-1">PNG, JPG, GIF, WebP (최대 5MB)</p>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
