"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { useState } from "react";
import { createServiceAction } from "./actions";
import { PRESETS } from "../../lib/surveyProfile";

const inputCls =
  "w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--gray-200)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--gray-900)]/10";

type Flags = {
  isAiService: boolean;
  hasRecommendation: boolean;
  isSafetyCritical: boolean;
  hasPersonalData: boolean;
  userFacingUi: boolean;
};

const FLAG_META: { key: keyof Flags; label: string; hint: string }[] = [
  { key: "isAiService", label: "AI 서비스", hint: "AI 전용 모듈(출력 정확성·강건성·투명성) 활성" },
  { key: "hasRecommendation", label: "추천·개인화 기능", hint: "추천 정확도 모듈 활성" },
  { key: "isSafetyCritical", label: "안전 민감(safety-critical)", hint: "안전성 모듈 활성(헬스케어 등)" },
  { key: "hasPersonalData", label: "개인정보 수집", hint: "보안 가중치 상향" },
  { key: "userFacingUi", label: "사용자 대면 UI", hint: "상호작용 역량 강조" },
];

const DEFAULT_FLAGS: Flags = {
  isAiService: false,
  hasRecommendation: false,
  isSafetyCritical: false,
  hasPersonalData: false,
  userFacingUi: true,
};

export default function ServiceForm() {
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [preset, setPreset] = useState<string>("");

  // 프리셋을 바꾸면 체크박스가 기본값으로 돌아가므로, 직접 조정한 뒤라면 안내를 띄운다.
  const [presetReset, setPresetReset] = useState(false);

  function applyPreset(id: string) {
    const found = PRESETS.find((p) => p.id === id);
    const next = { ...DEFAULT_FLAGS, ...(found?.flags as Partial<Flags>) };
    const changed = (Object.keys(next) as (keyof Flags)[]).some((k) => next[k] !== flags[k]);
    setPreset(id);
    setFlags(next);
    setPresetReset(changed);
  }

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">새 서비스 등록</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        유형을 고르면 평가 항목이 자동 구성됩니다. 세부 속성은 직접 조정할 수 있습니다.
      </p>

      <form action={createServiceAction} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-[var(--muted)]">
            서비스명
            <input name="name" required placeholder="예: 학습도우미 챗봇" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-[var(--muted)]">
            서비스 유형(프리셋)
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
          <label className="text-xs text-[var(--muted)]">
            입력 형태(modality)
            <select name="modality" defaultValue="text" className={`mt-1 ${inputCls}`}>
              <option value="text">텍스트</option>
              <option value="image">이미지</option>
              <option value="voice">음성</option>
              <option value="multimodal">멀티모달</option>
            </select>
          </label>
        </div>

        <div>
          <p className="text-xs text-[var(--muted)] mb-2">서비스 속성</p>
          {presetReset && (
            <p className="text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] mb-2 leading-relaxed">
              유형을 바꿔서 아래 속성이 그 유형의 기본값으로 다시 설정되었습니다. 필요하면
              직접 조정하세요.
            </p>
          )}
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
        </div>

        <SubmitButton className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)]">
          서비스 등록
        </SubmitButton>
      </form>
    </section>
  );
}
