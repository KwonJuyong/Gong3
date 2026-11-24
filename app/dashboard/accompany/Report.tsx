import { compareReadings, phaseLabel, type CheckAnswer, type Observation } from "@/app/lib/scenario";

const fmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
type Row = Observation & { checks: unknown; requests: unknown[] };

// 회색은 출발 전 예상, 남색은 실제 결과. 막대마다 숫자를 함께 표시(색만으로 구분하지 않음)
const tone = (phase: number) => (phase === 0 ? "bg-[var(--gray-300)]" : "bg-[var(--accent)]");
const label = (phase: number) => (phase === 0 ? "출발 전 예상" : phase === 1 ? "실제 결과" : `${phaseLabel(phase)} 결과`);

function Bar({ phase, ratio, text, title }: { phase: number; ratio: number; text: string; title: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="h-3 flex-1 rounded-full bg-[var(--gray-100)]">
        <div className={`h-3 rounded-full ${tone(phase)}`} style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 3 : 0)}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums">{text}</span>
    </div>
  );
}

export default function Report({ rows, items, phases, unit, lowerBetter }: {
  rows: Row[]; items: string[]; phases: number[]; unit: string; lowerBetter: boolean;
}) {
  const shown = [0, ...phases];
  const requestCount = rows.reduce((n, r) => n + r.requests.length, 0);
  const at = (phase: number) => rows.filter((r) => r.phase === phase);
  const answers = (phase: number, i: number) =>
    at(phase).map((r) => (Array.isArray(r.checks) ? (r.checks[i] as CheckAnswer | undefined) : undefined)).filter(Boolean);
  const ease = (phase: number) => {
    const list = at(phase);
    return list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : null;
  };
  const legend = (
    <div className="flex flex-wrap gap-4 text-sm">
      {shown.map((p) => (
        <span key={p} className="inline-flex items-center gap-2">
          <span className={`h-3 w-3 rounded-sm ${tone(p)}`} aria-hidden="true" />{label(p)}
        </span>
      ))}
    </div>
  );

  return (
    <section className="space-y-6 rounded-[var(--radius-xl)] bg-white p-5 sm:p-7">
      <h2 className="text-base font-bold">결과 한눈에 보기</h2>
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {([["출발 전 기록", at(0).length, "명"], ["결과 기록", at(1).length, "명"], ["개선 요청", requestCount, "건"]] as const).map(([k, v, u]) => (
          <div key={k} className="rounded-[var(--radius-lg)] bg-[var(--accent-light)] px-4 py-3">
            <dt className="text-xs text-[var(--muted)]">{k}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--accent)]">{v}<span className="ml-0.5 text-sm font-medium text-[var(--muted)]">{u}</span></dd>
          </div>
        ))}
      </dl>
      {legend}

      {items.length > 1 ? (
        <div className="space-y-4">
          <h3 className="font-semibold">완료 조건별로 해낸 학생 비율</h3>
          <ul className="space-y-4">
            {items.map((item, i) => (
              <li key={item} className="space-y-1.5">
                <p className="text-sm font-medium">{i + 1}. {item}</p>
                {shown.map((p) => {
                  const list = answers(p, i);
                  const yes = list.filter((a) => a === "yes").length;
                  return (
                    <Bar key={p} phase={p} ratio={list.length ? yes / list.length : 0}
                      text={list.length ? `${yes}/${list.length}명` : "기록 없음"}
                      title={`${label(p)}: ${p === 0 ? "할 수 있을 것 같다" : "됐다"} ${yes}명, 응답 ${list.length}명`} />
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        phases.map((phase) => {
          const r = compareReadings(rows, phase === 1 ? 0 : 1, phase);
          return (
            <p key={phase} className="text-sm">
              {phaseLabel(phase)} · {r.change === null ? "비교할 값이 아직 없어요"
                : `${fmt.format(r.before!)} → ${fmt.format(r.after!)} ${unit} (${lowerBetter ? "낮을수록" : "높을수록"} 좋음, ${r.measured}명)`}
            </p>
          );
        })
      )}

      <div className="space-y-1.5">
        <h3 className="font-semibold">얼마나 쉬웠나 (1 매우 어려움 ~ 7 매우 쉬움)</h3>
        {shown.map((p) => {
          const avg = ease(p);
          return (
            <Bar key={p} phase={p} ratio={avg === null ? 0 : (avg - 1) / 6}
              text={avg === null ? "기록 없음" : `평균 ${fmt.format(avg)}점`}
              title={`${label(p)} 쉬움 평균, 응답 ${at(p).length}명`} />
          );
        })}
      </div>

      <p className="text-xs text-[var(--muted)]">
        모든 조건을 확인 못 한 기록은 비율에서 빠져요. 인원이 적을 때는 학생별 기록과 대화를 함께 봐 주세요.
      </p>
    </section>
  );
}
