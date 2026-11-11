const STEPS = ["서비스 등록", "평가문항 확정", "일정·인원", "승인 요청"];

/** 평가 만들기 진행 단계. current 는 1부터, 없으면 전체 흐름만 보여줌 */
export default function CreateSteps({ current }: { current?: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
      {STEPS.map((label, i) => {
        const on = i + 1 === current;
        return (
          <li key={label} aria-current={on ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">›</span>}
            <span className={on ? "font-semibold text-[var(--accent)]" : ""}>
              {i + 1}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
