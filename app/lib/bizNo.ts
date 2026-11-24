export function normalizeBizNo(raw: string | null | undefined): string {
  return (raw || "").replace(/[^0-9]/g, "");
}

// 국세청 사업자등록번호 체크섬 검증(000/00 구조 오류 포함 차단)
export function isValidBizNo(raw: string | null | undefined): boolean {
  const n = normalizeBizNo(raw);
  if (n.length !== 10) return false;
  if (n.slice(0, 3) === "000") return false;
  if (n.slice(3, 5) === "00") return false;

  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const d = n.split("").map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * w[i];
  sum += Math.floor((d[8] * 5) / 10);

  return (10 - (sum % 10)) % 10 === d[9];
}

export const BIZ_NO_ERROR = "사업자등록번호가 올바르지 않습니다. 10자리를 다시 확인해 주세요.";
