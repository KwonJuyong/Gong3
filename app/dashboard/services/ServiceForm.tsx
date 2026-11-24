"use client";

import SubmitButton from "@/app/components/SubmitButton";
import { ui } from "@/app/components/ui";
import { useState } from "react";
import { createServiceAction } from "./actions";
import { PRESETS } from "../../lib/surveyProfile";

const inputCls = ui.field;

type Flags = {
  isAiService: boolean;
  hasRecommendation: boolean;
  isSafetyCritical: boolean;
  hasPersonalData: boolean;
  userFacingUi: boolean;
};

const FLAG_META: { key: keyof Flags; label: string; hint: string }[] = [
  { key: "isAiService", label: "AI 서비스", hint: "AI 전용 평가 항목(출력 정확성·강건성·투명성)을 포함해요" },
  { key: "hasRecommendation", label: "추천·개인화 기능", hint: "추천 정확도 평가 항목을 포함해요" },
  { key: "isSafetyCritical", label: "안전 민감", hint: "안전성 평가 항목을 포함해요(헬스케어 등)" },
  { key: "hasPersonalData", label: "개인정보 수집", hint: "보안 평가 비중을 높여요" },
  { key: "userFacingUi", label: "사용자 화면이 있음", hint: "상호작용 평가 항목을 강조해요" },
];

const DEFAULT_FLAGS: Flags = {
  isAiService: false,
  hasRecommendation: false,
  isSafetyCritical: false,
  hasPersonalData: false,
  userFacingUi: true,
};

/** 표준 설문의 첫 단계. 서비스 유형·기능이 표준 문항 구성을 정함 */
export default function ServiceForm({ defaultOpen, date }: { defaultOpen: boolean; date: string }) {
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [preset, setPreset] = useState<string>("");

  function applyPreset(id: string) {
    const found = PRESETS.find((p) => p.id === id);
    const next = { ...DEFAULT_FLAGS, ...(found?.flags as Partial<Flags>) };
    setPreset(id);
    setFlags(next);
  }

  return (
    <details open={defaultOpen} className={`group ${ui.panel}`}>
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
        <span>
          <span className="block text-base font-bold text-[var(--foreground)]">새 서비스 등록</span>
          <span className={`block ${ui.hint} mt-0.5`}>
            서비스 유형과 기능에 맞춰 표준 문항 초안을 만들어 드려요.
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--gray-500)] transition-transform group-open:rotate-180" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <form action={createServiceAction} className="space-y-4 mt-4">
        {date && <input type="hidden" name="d" value={date} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            서비스명
            <input name="name" required placeholder="예: 학습도우미 챗봇" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-sm font-semibold">
            서비스 유형
            <select
              name="preset"
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              <option value="">선택 안 함</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>


        {/* 유형이 기본값을 정하므로 세부 속성은 필요한 사람만 펼침. 설문 문항 구성에만 쓰임 */}
        <details>
          <summary className={`${ui.textButton} cursor-pointer mb-2 select-none`}>설문에 넣을 서비스 기능 변경</summary>
          <label className="text-sm font-semibold">
            입력 형태
            <select name="modality" defaultValue="text" className={`mt-1 ${inputCls}`}>
              <option value="text">텍스트</option>
              <option value="image">이미지</option>
              <option value="voice">음성</option>
              <option value="multimodal">멀티모달</option>
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FLAG_META.map((f) => (
              <label
                key={f.key}
                className="flex items-start gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] cursor-pointer hover:bg-[var(--surface)]"
              >
                <input
                  type="checkbox"
                  name={f.key}
                  checked={flags[f.key]}
                  onChange={(e) => setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm text-[var(--foreground)]">{f.label}</span>
                  <span className="block text-xs text-[var(--gray-500)]">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </details>

        <div className="flex justify-end">
          <SubmitButton pendingText="서비스 등록 중…" className={ui.primary}>등록하고 표준 문항 만들기</SubmitButton>
        </div>
      </form>
    </details>
  );
}
