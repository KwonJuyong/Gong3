import type { ScenarioBrief, ScenarioReading, ScenarioRelease, ScenarioRequest } from "@prisma/client";
import ConfirmButton from "@/app/components/ConfirmButton";
import { checkItems, phaseLabel, recheckResults } from "@/app/lib/scenario";
import { saveScenario } from "./actions";
import { ui } from "@/app/components/ui";

export default function StudentRecords({ projectId, brief, rows, latest, link }: {
  projectId: string;
  brief: ScenarioBrief & { releases: ScenarioRelease[] };
  rows: (Omit<ScenarioReading, "transcript"> & { requests: ScenarioRequest[] })[];
  latest: number;
  link: string | null;
}) {
  const action = saveScenario.bind(null, projectId);
  const requests = rows.flatMap((r) => r.requests);
  const versionOf = (phase: number) => brief.releases.find((v) => v.phase === phase)?.version;
  const total = checkItems(brief.metric).length;
  // 요청을 남기지 않은 학생도 마친 뒤 자기 기록(예상 대비 실제)을 볼 수 있게 함. 항목 응답이 없는 옛 기록은 수행값과 단위로 표시
  const records = [...rows].filter((r) => r.phase === 0 || r.phase <= latest).sort((a, b) => a.phase - b.phase);
  if (!records.some((r) => r.phase > 0) && !requests.length && !brief.releases.length) return null;

  return (
    <>
    {records.some((r) => r.phase > 0) && (
      <section className={`${ui.panel} space-y-3`}>
        <h2 className="text-base font-bold">내 기록</h2>
        <dl className="divide-y divide-[var(--gray-100)]">
          {records.map((r) => (
            <div key={r.phase} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <dt className="text-sm text-[var(--muted)]">{r.phase === 0 ? "출발 전 예상" : `${phaseLabel(r.phase)}${r.phase > 1 && versionOf(r.phase) ? ` · ${versionOf(r.phase)}` : ""}`}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {r.value === null ? "확인 못 함" : Array.isArray(r.checks) ? `완료 조건 ${r.value}/${total}개` : `${r.value}${brief.unit}`} · 쉬움 {r.rating}/7
              </dd>
            </div>
          ))}
        </dl>
      </section>
    )}
    {(requests.length > 0 || brief.releases.length > 0) && (
    <section className={`${ui.panel} space-y-5`}>
      <h2 className="text-base font-bold">내 요청과 개발사 답</h2>
      {brief.releases.map((r) => (
        <div key={r.phase} className={`${ui.tint} space-y-1 px-4 py-3`}>
          <p className={ui.label}>새 버전 {r.version}</p>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{r.reply}</p>
        </div>
      ))}
      <ul className="divide-y divide-[var(--gray-100)]">
        {requests.map((r) => (
          <li key={r.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="space-y-1">
              <p className="text-xs text-[var(--muted)]">{phaseLabel(r.phase)}에 보낸 요청</p>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{r.note}</p>
            </div>
            {r.reply ? (
              <div className={`${ui.tint} space-y-1 px-4 py-3`}>
                <p className={ui.label}>개발사 답 · {r.decision}{r.deployedPhase !== null && ` · ${versionOf(r.deployedPhase)}에 반영`}</p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{r.reply}</p>
              </div>
            ) : (
              <p className={ui.hint}>개발사가 아직 답하지 않았어요.</p>
            )}
            {r.recheckedAt ? (
              <p className={ui.hint}>다시 확인한 결과 · {r.recheckResult}</p>
            ) : r.deployedPhase === latest && r.deployedPhase !== null ? (
              <form action={action} className="space-y-3">
                <input type="hidden" name="op" value="recheck" />
                <input type="hidden" name="reading" value={r.id} />
                <input type="hidden" name="phase" value={latest} />
                <p className={ui.label}>새 버전에서 이 문제가 고쳐졌는지 확인해 주세요</p>
                {link && <a href={link} target="_blank" rel="noreferrer" className={ui.link}>새 버전 열기</a>}
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">확인 결과</legend>
                  {recheckResults.map((result) => (
                    <label key={result} className="cursor-pointer">
                      <input type="radio" name="result" value={result} required className="peer sr-only" />
                      <span className={`${ui.chipBase} bg-white ring-[var(--gray-200)] hover:ring-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-white peer-checked:ring-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--accent)]`}>{result}</span>
                    </label>
                  ))}
                </fieldset>
                <textarea name="observation" className={ui.field} rows={2} maxLength={1500} required placeholder="무엇이 달라졌는지, 또는 확인하기 어려웠던 이유" />
                <ConfirmButton className={ui.primary} message="확인 결과를 개발사에 보낼까요?">확인 결과 보내기</ConfirmButton>
              </form>
            ) : r.deployedPhase !== null ? (
              <p className={ui.hint}>확인 기간이 끝났어요.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
    )}
    </>
  );
}
