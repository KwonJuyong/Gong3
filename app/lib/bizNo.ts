/**
 * 사업자등록번호 형식 검증.
 *
 * 유료 조회(팝빌) 전에 체크섬으로 잘못된 번호를 먼저 거름
 * 체크섬은 형식만 보며 실재 여부(휴폐업·미등록)는 팝빌 조회로 확인함
 */

/** 숫자만 남김. 저장·비교·조회에 쓰는 형태. */
export function normalizeBizNo(raw: string | null | undefined): string {
  return (raw || "").replace(/[^0-9]/g, "");
}

/**
 * 국세청 사업자등록번호 검증 알고리즘
 *
 * 가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 더하고, 9번째 자리의 (×5) 몫을 한 번 더
 * 더한 뒤, 10 의 보수 끝자리가 마지막 자리와 같아야 함
 *
 * 체크섬만으로는 0000000000 이 통과하므로 구조도 확인함. 앞 3자리(세무서 코드)는 000 이
 * 없고, 가운데 2자리(개인/법인 구분)는 00 이 없음
 */
export function isValidBizNo(raw: string | null | undefined): boolean {
  const n = normalizeBizNo(raw);
  if (n.length !== 10) return false;

  // 체크섬이 못 거르는 0000000000 같은 값을 막음
  if (n.slice(0, 3) === "000") return false;
  if (n.slice(3, 5) === "00") return false;

  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const d = n.split("").map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * w[i];
  sum += Math.floor((d[8] * 5) / 10);

  return (10 - (sum % 10)) % 10 === d[9];
}

/** 화면·PDF 표기용 `123-45-67890`. 10자리가 아니면 원본을 그대로 돌려줌 */
export function formatBizNo(raw: string | null | undefined): string {
  const n = normalizeBizNo(raw);
  if (n.length !== 10) return raw || "";
  return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
}

/** 입력 지점이 공유하는 오류 문구 */
export const BIZ_NO_ERROR = "사업자등록번호가 올바르지 않습니다. 10자리를 다시 확인해 주세요.";
