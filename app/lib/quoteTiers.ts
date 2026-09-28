/**
 * 소요시간별 평가단 보상 최저단가(견적서용).
 * 법정 기준이 아니라 운영상 정한 하한이다. 이보다 낮출 수 없고 올리는 것은 자유다.
 */

export interface TimeTier {
  key: string;
  label: string;
  /** 1인당 보상 하한 (원) */
  floor: number;
}

export const TIME_TIERS: TimeTier[] = [
  { key: "t30", label: "30분 이하", floor: 20000 },
  { key: "t60", label: "30분~1시간", floor: 25000 },
  { key: "t120", label: "1~2시간", floor: 30000 },
  { key: "t120p", label: "2시간 이상", floor: 35000 },
];

export const DEFAULT_TIER = TIME_TIERS[0];

export function tierOf(key: string): TimeTier {
  return TIME_TIERS.find((t) => t.key === key) ?? DEFAULT_TIER;
}

/** 단가가 하한보다 낮으면 하한으로 올린다(화면과 서버 공용). */
export function enforceFloor(tierKey: string, unitPrice: number): number {
  return Math.max(tierOf(tierKey).floor, Math.floor(unitPrice) || 0);
}
