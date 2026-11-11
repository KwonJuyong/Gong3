// 서비스 프로파일(속성 플래그) → 활성 구성개념 판정 로직.
// 설문 구성·LLM 생성·등록 미리보기에서 함께 씀(서버/클라이언트 양쪽 import 가능).

export type ServiceProfile = {
  isAiService: boolean;
  hasRecommendation: boolean;
  isSafetyCritical: boolean;
  hasPersonalData: boolean;
  userFacingUi: boolean;
  preset: string | null;
  /** text | image | voice | multimodal. A_MODALITY 구성개념 선택에 씀 */
  modality: string;
};

// 6개 유형 프리셋: 속성 플래그의 프리필(UX용). 선택 후 개별 조정 가능.
export const PRESETS: { id: string; label: string; flags: Partial<ServiceProfile> }[] = [
  { id: "education", label: "교육 / 에듀테크", flags: { userFacingUi: true } },
  { id: "healthcare", label: "헬스케어", flags: { isSafetyCritical: true, hasPersonalData: true } },
  { id: "productivity", label: "생산성 / 업무", flags: { userFacingUi: true } },
  { id: "commerce", label: "커머스 / 추천", flags: { hasRecommendation: true } },
  { id: "chatbot", label: "대화형 AI / 챗봇", flags: { isAiService: true, userFacingUi: true } },
  { id: "other", label: "기타", flags: {} },
];

// 구성개념(group/id)이 주어진 프로파일에서 활성화되는지 판정.
export function isConstructActive(
  c: { id: string; group: string },
  p: ServiceProfile,
): boolean {
  switch (c.group) {
    case "A_CORE":
      return true; // 공통 코어, 항상 적용
    case "A_AI":
      return p.isAiService; // ISO 25059 AI 모듈
    case "A_DOMAIN":
      if (c.id === "recommendation_accuracy") return p.hasRecommendation;
      if (c.id === "safety") return p.isSafetyCritical;
      if (c.id === "deep_accessibility")
        return p.preset === "education"; // 공공·교육 서비스
      return false;
    // 입력 형태(modality)별 품질. 모달 간 일관성처럼 특정 형태에만 있는 구성개념이 있음
    case "A_MODALITY": {
      const m = p.modality || "text";
      const visual = m === "image" || m === "multimodal";
      const audio = m === "voice" || m === "multimodal";
      if (c.id === "visual_fidelity" || c.id === "visual_artifact") return visual;
      if (c.id === "speech_recognition" || c.id === "speech_naturalness") return audio;
      if (c.id === "cross_modal_consistency") return m === "multimodal";
      return false;
    }
    case "A_EDU":
      return p.preset === "education"; // 교육 서비스 전용 검증도구
    case "A_DEV":
      return true; // 개발사 자가평가, 항상 적용(응답 주체만 다름)
    case "B":
      return true; // 사용 품질
    case "C":
      return true; // 운영·메타
    default:
      return false;
  }
}

// 보안 가중치: 개인정보 보유 시 상향
export function securityWeight(base: number, p: ServiceProfile): number {
  return p.hasPersonalData ? Math.round(base * 1.5) : base;
}
