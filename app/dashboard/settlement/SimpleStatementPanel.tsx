"use client";

import { useState } from "react";

/**
 * 간이지급명세서(기타소득) 국세청 일괄등록 양식 내려받기.
 *
 * 주민번호가 없는 소득자는 가산세 대상이 되므로 먼저 점검(?check=1, 이름만 받음)하고
 * 그 뒤에 다운로드를 열기. 주민번호는 xlsx 다운로드에만 들어가고 AuditLog 에 남음
 */

interface CheckResult {
  year: number;
  month: number;
  totals: {
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
  };
  blockers: string[];
  warnings: string[];
  missingRrn: { name: string; grossAmount: number }[];
  ready: boolean;
}

import { won } from "../../lib/money";

export default function SimpleStatementPanel({
  defaultYear,
  defaultMonth,
}: {
  defaultYear: number;
  defaultMonth: number;
}) {
  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const qs = `year=${year}&month=${month}`;

  async function check() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/settlement/withholding/simple-statement?${qs}&check=1`);
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "점검에 실패했습니다.");
      else setResult(json as CheckResult);
    } catch {
      setError("점검에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setLoading(false);
    }
  }

  // 연·월을 바꾸면 이전 점검 결과를 지움
  function reset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setResult(null);
      setError(null);
    };
  }

  const sel = "px-2 py-1.5 text-xs border border-[var(--gray-200)] rounded-[var(--radius-md)]";

  return (
    <div className="mt-3 pt-3 border-t border-[var(--gray-100)]">
      <p className="text-xs font-medium text-[var(--foreground)]">
        간이지급명세서: 홈택스 일괄등록 양식
        <span className="text-[var(--muted)] font-normal">
          {" "}
          · 소득자 1명당 1행 · 소득구분 76(인적용역)
        </span>
      </p>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <select value={year} onChange={(e) => reset(setYear)(e.target.value)} className={sel}>
          {[defaultYear, defaultYear - 1].map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => reset(setMonth)(e.target.value)} className={sel}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] disabled:opacity-40"
        >
          {loading ? "점검 중…" : "점검하기"}
        </button>
        <button
          type="button"
          disabled={!result?.ready}
          title={result?.ready ? undefined : "먼저 점검하세요"}
          onClick={() => {
            window.location.href = `/api/settlement/withholding/simple-statement?${qs}`;
          }}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          엑셀 받기
        </button>
        <span className="text-xs text-[var(--gray-500)]">주민번호 포함 · 다운로드 기록됨</span>
      </div>

      {error && <p className="text-xs text-[var(--warning)] mt-2">{error}</p>}

      {result && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              인원 <strong className="text-[var(--foreground)]">{result.totals.headcount}명</strong>
            </span>
            <span>
              지급건수{" "}
              <strong className="text-[var(--foreground)]">{result.totals.entryCount}건</strong>
            </span>
            <span>
              지급액{" "}
              <strong className="text-[var(--foreground)]">{won(result.totals.grossAmount)}</strong>
            </span>
            <span>
              소득세{" "}
              <strong className="text-[var(--foreground)]">{won(result.totals.incomeTax)}</strong>
            </span>
            <span>
              지방소득세{" "}
              <strong className="text-[var(--foreground)]">{won(result.totals.localTax)}</strong>
            </span>
          </div>

          {/* 다운로드를 막는 사유(빠진 사람 이름) */}
          {result.blockers.map((b, i) => (
            <p
              key={i}
              className="text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed"
            >
              {b}
            </p>
          ))}
          {result.missingRrn.length > 0 && (
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              주민번호 미등록:{" "}
              <strong className="text-[var(--foreground)]">
                {result.missingRrn.map((m) => m.name).join(", ")}
              </strong>
              {": "}아래 「평가자 정산 정보」에서 확인·대리입력할 수 있습니다.
            </p>
          )}

          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-[var(--muted)] leading-relaxed">
              ※ {w}
            </p>
          ))}

          {result.ready && (
            <p className="text-xs text-[var(--gray-500)] leading-relaxed">
              홈택스 → 지급명세·자료·공익법인 → (일용·간이·용역) 소득자료 제출 → 직접작성 제출
              → 우측 상단 <strong>[엑셀서식작성]</strong> 에 올린 뒤 <strong>[검증하기]</strong>.
              제출구분은 기한 내이면 <strong>정기신고</strong>입니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
