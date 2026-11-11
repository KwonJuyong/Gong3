/**
 * CSV 셀 하나. 숫자가 아닌 값이 = + - @ 탭·CR 로 시작하면 앞에 ' 를 붙여
 * 엑셀이 수식으로 실행하지 않게 함(응답·이름 등 사용자 입력이 그대로 실림).
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
