"use client";

/**
 * 조회 결과 차트(SVG 로 직접 그림).
 *
 *   groupBy  → 막대
 *   trend    → 선
 *   crosstab → 누적 막대
 *   count/aggregate/list → 차트 없음
 */

const PALETTE = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5"];

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

/** 막대차트(groupBy) */
function BarChart({ rows, labelKey, valueKey }: { rows: Row[]; labelKey: string; valueKey: string }) {
  const data = rows.slice(0, 25);
  const max = niceMax(Math.max(...data.map((r) => num(r[valueKey])), 0));
  const barH = 22;
  const gap = 8;
  const labelW = 130;
  const chartW = 460;
  const h = data.length * (barH + gap) + 24;

  return (
    <svg viewBox={`0 0 ${labelW + chartW + 50} ${h}`} className="w-full" role="img" aria-label="막대 차트">
      {data.map((r, i) => {
        const v = num(r[valueKey]);
        const w = max ? (v / max) * chartW : 0;
        const y = i * (barH + gap);
        const label = String(r[labelKey] ?? "(없음)");
        return (
          <g key={i}>
            <title>{`${label}: ${v.toLocaleString()}`}</title>
            <text x={labelW - 8} y={y + barH * 0.7} textAnchor="end" fontSize="11" fill="var(--gray-600, #555)">
              {label.length > 16 ? label.slice(0, 15) + "…" : label}
            </text>
            <rect x={labelW} y={y} width={Math.max(w, v > 0 ? 2 : 0)} height={barH} rx="3" fill={PALETTE[0]} />
            <text x={labelW + w + 6} y={y + barH * 0.7} fontSize="11" fill="var(--gray-700, #333)">
              {v.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 선차트(trend) */
function LineChart({ rows, labelKey, valueKey }: { rows: Row[]; labelKey: string; valueKey: string }) {
  const data = rows;
  if (data.length < 2) return <BarChart rows={rows} labelKey={labelKey} valueKey={valueKey} />;

  const W = 640, H = 220, padL = 44, padB = 34, padT = 12, padR = 12;
  const max = niceMax(Math.max(...data.map((r) => num(r[valueKey])), 0));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (max ? (v / max) * innerH : 0);

  const pts = data.map((r, i) => `${x(i)},${y(num(r[valueKey]))}`).join(" ");
  // x 축 라벨은 겹치지 않도록 솎아냄
  const step = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="추이 선 차트">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" fill="#888">
            {Math.round(max * f).toLocaleString()}
          </text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={PALETTE[0]} strokeWidth="2" />
      {data.map((r, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(num(r[valueKey]))} r="3" fill={PALETTE[0]}>
            <title>{`${String(r[labelKey])}: ${num(r[valueKey]).toLocaleString()}`}</title>
          </circle>
          {i % step === 0 && (
            <text x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize="10" fill="#888">
              {String(r[labelKey] ?? "")}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** 누적 막대(crosstab) */
function StackedBar({ rows, labelKey, seriesKeys }: { rows: Row[]; labelKey: string; seriesKeys: string[] }) {
  const data = rows.slice(0, 20);
  const totals = data.map((r) => seriesKeys.reduce((s, k) => s + num(r[k]), 0));
  const max = niceMax(Math.max(...totals, 0));
  const barH = 22, gap = 8, labelW = 130, chartW = 440;
  const h = data.length * (barH + gap) + 8;

  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-xs">
        {seriesKeys.map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            {k}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${labelW + chartW + 50} ${h}`} className="w-full" role="img" aria-label="누적 막대 차트">
        {data.map((r, i) => {
          const y = i * (barH + gap);
          let acc = 0;
          const label = String(r[labelKey] ?? "(없음)");
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + barH * 0.7} textAnchor="end" fontSize="11" fill="var(--gray-600, #555)">
                {label.length > 16 ? label.slice(0, 15) + "…" : label}
              </text>
              {seriesKeys.map((k, si) => {
                const v = num(r[k]);
                if (v <= 0) return null;
                const w = max ? (v / max) * chartW : 0;
                const xPos = labelW + acc;
                acc += w;
                return (
                  <rect key={k} x={xPos} y={y} width={w} height={barH} fill={PALETTE[si % PALETTE.length]}>
                    <title>{`${label} / ${k}: ${v.toLocaleString()}`}</title>
                  </rect>
                );
              })}
              <text x={labelW + acc + 6} y={y + barH * 0.7} fontSize="11" fill="var(--gray-700, #333)">
                {totals[i].toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function QueryChart({
  mode,
  columns,
  rows,
}: {
  mode: string;
  columns: string[];
  rows: Row[];
}) {
  if (!rows.length) return null;

  if (mode === "groupBy" && columns.length >= 2)
    return <BarChart rows={rows} labelKey={columns[0]} valueKey={columns[1]} />;

  if (mode === "trend" && columns.length >= 2)
    return <LineChart rows={rows} labelKey={columns[0]} valueKey={columns[1]} />;

  if (mode === "crosstab" && columns.length >= 3) {
    // 첫 열은 행 라벨, 마지막 열은 합계이고 그 사이가 계열임
    const series = columns.slice(1, -1);
    if (!series.length) return null;
    return <StackedBar rows={rows} labelKey={columns[0]} seriesKeys={series} />;
  }

  // count·aggregate·list 는 차트를 만들지 않음
  return null;
}
