/**
 * 최소 RFC4180 CSV 파서.
 *
 * Epoch CSV에는 따옴표 안에 쉼표가 든 필드가 실제로 들어 있음
 * (표시명 `"GPT-5.6 Sol (pro, max)"`). `split(",")`로 자르면 그 행부터 열이 밀림
 * 파싱 대상이 우리가 아는 CSV 2개뿐이라 의존성을 늘리지 않고 직접 둠
 */
export function parseCsv(text: string): Record<string, string>[] {
  // BOM이 남아 있으면 첫 헤더명이 오염돼 컬럼 조회가 전부 빗나감
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // 이스케이프된 따옴표("")
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  // 마지막 줄에 개행이 없을 수 있음
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((r) => r.some((v) => v.trim() !== "")) // 빈 줄 제거
    .map((r) =>
      Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])),
    );
}
