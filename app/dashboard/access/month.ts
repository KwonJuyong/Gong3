/** "2026-09" → 한국 시각 기준 그 달의 [시작, 다음 달 시작). 형식이 틀리면 null. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = new Date(`${m[1]}-${m[2]}-01T00:00:00+09:00`);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  const to = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+09:00`);
  return { from, to };
}

/** 한국 시각 기준 "YYYY-MM". offset 은 달 단위(−1 = 지난달). */
export function kstMonth(offset = 0, now = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600e3);
  const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
