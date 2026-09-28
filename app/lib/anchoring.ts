// 앵커링 비네트 기반 평가자 척도사용 편차 보정.
// 방법론: King, Murray, Salomon & Tandon (2004); King & Wand (2007) 비모수(non-parametric) C.
//
// 아이디어: 모든 평가자가 동일한 고정 시나리오(비네트)를 같은 척도로 평가한다.
// 평가자의 자기응답 y 를, 그 평가자 자신의 비네트 평가 z(=개인 기준점)에 상대적으로
// 재코딩하면(C), 평가자마다 다른 관대함/엄격함이 제거되어 서비스·회차 간 비교가 가능해진다.

export type Corrected = {
  c: number; // 보정된 순서형 범주 (1 .. 2K+1)
  maxC: number; // 2K+1
  consistent: boolean; // 비네트 응답이 의도 순서(약단조)를 지키는가
};

/**
 * 비모수 보정 범주 C 계산.
 * @param y  자기응답(실제 문항 점수)
 * @param z  비네트 응답 배열. 의도된 품질 오름차순(z[0]=가장 낮은 수준 ... z[K-1]=가장 높은 수준)
 *
 * 정의(King & Wand 2007):
 *   y < z1           → 1
 *   y = z1           → 2
 *   z1 < y < z2      → 3
 *   y = z2           → 4
 *   ...
 *   y = zK           → 2K
 *   y > zK           → 2K+1
 */
export function correctedCategory(y: number, z: number[]): Corrected {
  const K = z.length;
  const maxC = 2 * K + 1;

  // 일관성(약단조 증가) 검사 — 위반 응답자는 censoring 대상 후보
  let consistent = true;
  for (let k = 1; k < K; k++) {
    if (z[k] < z[k - 1]) {
      consistent = false;
      break;
    }
  }

  for (let k = 0; k < K; k++) {
    if (y < z[k]) return { c: 2 * k + 1, maxC, consistent };
    if (y === z[k]) return { c: 2 * k + 2, maxC, consistent };
  }
  return { c: maxC, maxC, consistent }; // 모든 비네트보다 높음
}

/** 보정 범주를 0~100 비교가능 점수로 정규화 */
export function cToScore(c: number, maxC: number): number {
  if (maxC <= 1) return 0;
  return ((c - 1) / (maxC - 1)) * 100;
}

export type RaterResponse = {
  raterId: string;
  y: number; // 자기응답
  z: number[]; // 비네트 응답(의도 오름차순)
};

export type ConstructScore = {
  rawMean: number; // 보정 전 자기응답 평균(0~100 환산 전, 원척도)
  correctedMean: number; // 보정 후 0~100 비교가능 점수 평균
  n: number; // 사용된(일관성 있는) 응답 수
  dropped: number; // 일관성 위반으로 제외된 수
};

/**
 * 한 구성개념에 대한 여러 평가자 응답을 비교가능 점수로 집계.
 * 일관성 위반 응답자는 보정 집계에서 제외(dropped)하되 rawMean에는 포함하지 않음.
 */
export function aggregateConstruct(responses: RaterResponse[]): ConstructScore {
  if (responses.length === 0) {
    return { rawMean: 0, correctedMean: 0, n: 0, dropped: 0 };
  }
  let rawSum = 0;
  let corrSum = 0;
  let n = 0;
  let dropped = 0;

  for (const r of responses) {
    const { c, maxC, consistent } = correctedCategory(r.y, r.z);
    if (!consistent) {
      dropped++;
      continue;
    }
    rawSum += r.y;
    corrSum += cToScore(c, maxC);
    n++;
  }

  return {
    rawMean: n > 0 ? rawSum / n : 0,
    correctedMean: n > 0 ? corrSum / n : 0,
    n,
    dropped,
  };
}
