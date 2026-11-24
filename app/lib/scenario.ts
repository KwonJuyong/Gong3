export const decisions = ["수용", "부분 수용", "보류", "미수용"] as const;

export const recheckResults = ["해결", "부분 해결", "미해결", "확인 불가"] as const;

export type Observation = {
  userId: string;
  phase: number;
  rating: number;
  value: number | null;
};

export function nextPhase(phases: number[], latest: number, active: boolean) {
  if (latest > 1)
    return phases.includes(1) && !phases.includes(latest) ? latest : null;
  if (!active || phases.includes(1)) return null;
  return phases.includes(0) ? 1 : 0;
}

export const checkAnswers = ["yes", "no", "unknown"] as const;
export type CheckAnswer = (typeof checkAnswers)[number];

// 완료 확인 항목은 측정 기준의 줄 단위. 앞의 번호·기호 제거
export function checkItems(metric: string) {
  return metric.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
}

export function readChecks(form: FormData, count: number): CheckAnswer[] | null {
  try {
    const raw: unknown = JSON.parse(String(form.get("checks") ?? ""));
    return Array.isArray(raw) && raw.length === count && raw.every((v) => checkAnswers.some((a) => a === v))
      ? (raw as CheckAnswer[])
      : null;
  } catch {
    return null;
  }
}

export function phaseLabel(phase: number) {
  if (phase === 0) return "사용 전";
  if (phase === 1) return "첫 사용 후";
  return `개선판 ${phase - 1}차`;
}

export function compareReadings(
  rows: Observation[],
  before: number,
  after: number,
) {
  const prior = new Map(
    rows.filter((r) => r.phase === before).map((r) => [r.userId, r]),
  );
  const current = rows.filter((r) => r.phase === after);
  let pairs = 0,
    measured = 0,
    start = 0,
    end = 0,
    ratingChange = 0;
  for (const row of current) {
    const previous = prior.get(row.userId);
    if (!previous) continue;
    pairs++;
    ratingChange += row.rating - previous.rating;
    if (previous.value === null || row.value === null) continue;
    measured++;
    start += previous.value;
    end += row.value;
  }
  return {
    pairs,
    measured,
    submitted: current.length,
    prior: prior.size,
    before: measured ? start / measured : null,
    after: measured ? end / measured : null,
    change: measured ? (end - start) / measured : null,
    ratingChange: pairs ? ratingChange / pairs : null,
  };
}

// 항목 확인이 있으면 수행값은 「예」 개수, 전부 확인 못 함이면 측정 불가
export function readMeasurement(form: FormData, checks?: CheckAnswer[]) {
  const rating = form.get("rating");
  const raw = form.get("value");
  const note = form.get("note");
  const unknown = form.get("unknown") === "yes";
  if (
    typeof rating !== "string" ||
    !/^[1-7]$/.test(rating) ||
    typeof note !== "string" ||
    note.length > 1500
  )
    return null;
  if (checks)
    return {
      value: checks.every((c) => c === "unknown") ? null : checks.filter((c) => c === "yes").length,
      rating: Number(rating),
      note: note.trim(),
    };
  if (unknown)
    return { value: null, rating: Number(rating), note: note.trim() };
  if (typeof raw !== "string" || !/^-?\d+(\.\d+)?$/.test(raw.trim()))
    return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > 1e9) return null;
  return { value, rating: Number(rating), note: note.trim() };
}
