// 동결된 설문 본문(blocks)의 타입과 itemKey 규칙. 서버/클라이언트/리포트 공통.

export type AdaptiveBlock = {
  kind: "LLM_ADAPTIVE";
  constructId: string;
  constructName: string;
  scaleType: string; // LIKERT_5
  itemKey: string;
  text: string;
  /**
   * 응답 주체: EVALUATOR(평가단 학생) | DEVELOPER(개발사 자가평가).
   * 오래된 블록에는 없어서 blocksToProjectQuestions 가 constructSnapshot 으로 보충한다.
   */
  evaluator?: string;
};

export type InstrumentItemDef = {
  itemKey: string;
  ordinal: number;
  text: string;
  leftLabel: string | null;
  rightLabel: string | null;
  dimension: string | null;
  reverse: boolean;
};

export type InstrumentBlock = {
  kind: "INSTRUMENT";
  instrument: string;
  constructId: string;
  constructName: string;
  scaleType: string; // SEMANTIC_7 등
  items: InstrumentItemDef[];
};

export type VignetteBlock = {
  kind: "VIGNETTE";
  constructId: string;
  constructName: string;
  scaleType: string; // LIKERT_5
  items: { itemKey: string; level: number; text: string }[];
};

export type SurveyBlock = AdaptiveBlock | InstrumentBlock | VignetteBlock;

// itemKey 규칙 (응답 저장·채점에서 동일하게 사용)
export const adaptiveKey = (constructId: string) => `adaptive:${constructId}`;
export const instrumentKey = (instrument: string, ordinal: number) => `${instrument}:${ordinal}`;
export const vignetteKey = (constructId: string, level: number) => `vignette:${constructId}:${level}`;

// 모든 블록의 (점수 입력이 필요한) itemKey 목록
export function collectItemKeys(blocks: SurveyBlock[]): string[] {
  const keys: string[] = [];
  for (const b of blocks) {
    if (b.kind === "LLM_ADAPTIVE") keys.push(b.itemKey);
    else for (const it of b.items) keys.push(it.itemKey);
  }
  return keys;
}

// 직접 입력한 문항은 Project.questions 에 저장되고, 이 파일은 SurveyVersion 문항 전용이다.
