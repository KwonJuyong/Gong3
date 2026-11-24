import Link from "next/link";
import type { ScenarioBrief, ScenarioReading, ScenarioRelease, ScenarioRequest } from "@prisma/client";
import { prisma } from "@/app/db";
import ConfirmButton from "@/app/components/ConfirmButton";
import { checkItems, decisions, phaseLabel, type CheckAnswer } from "@/app/lib/scenario";
import { saveScenario } from "./actions";
import OpenScenarioInbox from "./OpenScenarioInbox";
import Report from "./Report";
import { ui } from "@/app/components/ui";
import Icon, { type IconName } from "@/app/components/Icon";

export const managerTabs = ["results", "requests", "students", "release", "guide"] as const;
export type ManagerTab = (typeof managerTabs)[number];

type Reading = Omit<ScenarioReading, "transcript"> & { requests: ScenarioRequest[] };
type Msg = { from: "npc" | "me"; text: string };

const hint: Record<string, string> = {
  "수용": "반영할 예정",
  "부분 수용": "일부만 반영",
  "보류": "지금은 판단 보류",
  "미수용": "반영하지 않음",
};
const mark: Record<CheckAnswer, string> = { yes: "✓", no: "×", unknown: "?" };
const pick = "block rounded-[var(--radius-md)] px-3 py-2.5 ring-1 ring-inset transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]";
// 처리 결과마다 뜻에 맞는 색. 고르면 진한 색으로 채움
const decisionTone: Record<string, string> = {
  "수용": "bg-[var(--success-light)] text-[var(--success)] ring-[var(--success-light)] hover:ring-[var(--success)] peer-checked:bg-[var(--success)] peer-checked:text-white",
  "부분 수용": "bg-[var(--accent-light)] text-[var(--accent)] ring-[var(--accent-light)] hover:ring-[var(--accent)] peer-checked:bg-[var(--accent)] peer-checked:text-white",
  "보류": "bg-[var(--warning-light)] text-[var(--warning)] ring-[var(--warning-light)] hover:ring-[var(--warning)] peer-checked:bg-[var(--warning)] peer-checked:text-white",
  "미수용": "bg-[var(--gray-100)] text-[var(--gray-700)] ring-[var(--gray-100)] hover:ring-[var(--gray-500)] peer-checked:bg-[var(--gray-700)] peer-checked:text-white",
};

// 학생이 올린 화면 캡처. 누르면 원본을 새 탭으로 엶
function Shots({ images }: { images: unknown }) {
  if (!Array.isArray(images) || !images.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="학생이 올린 화면 캡처">
      {(images as { url: string; name: string }[]).map((img) => (
        <li key={img.url}>
          <a href={img.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius-md)] ring-1 ring-[var(--gray-200)] transition hover:ring-[var(--accent)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.name} className="h-20 w-20 object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Transcript({ log }: { log: unknown }) {
  if (!Array.isArray(log) || !log.length) return <p className={ui.hint}>저장된 대화가 없어요.</p>;
  return (
    <div className="max-h-[28rem] space-y-2 overflow-y-auto">
      {(log as Msg[]).map((m, i) => (
        <p key={i} className={m.from === "me" ? ui.bubbleMe : ui.bubbleAiOnGray}>{m.text}</p>
      ))}
    </div>
  );
}

export default async function ManagerBoard({ projectId, brief, rows, latest, tab, admin, recruiting, inbox }: {
  projectId: string; brief: ScenarioBrief & { releases: ScenarioRelease[] }; rows: Reading[]; latest: number;
  tab: ManagerTab; admin: boolean; recruiting: boolean; inbox: boolean;
}) {
  const action = saveScenario.bind(null, projectId);
  const items = checkItems(brief.metric);
  const tasks = await prisma.scenarioTask.findMany({ where: { projectId }, select: { userId: true, phase: true, incident: true } });
  // 대화 원문은 학생 탭에서만 읽음(결과·요청 탭 조회를 가볍게)
  const transcripts = tab === "students"
    ? await prisma.scenarioReading.findMany({ where: { projectId }, select: { userId: true, phase: true, transcript: true } })
    : [];
  const students = [...new Set(rows.map((r) => r.userId))];
  const alias = (userId: string) => `학생 ${students.indexOf(userId) + 1}`;
  const requests = rows.flatMap((r) => r.requests.map((q) => ({ ...q, reading: r })));
  const pending = requests.filter((r) => !r.repliedAt);
  const linkable = requests.filter((r) => r.deployedPhase === null && (r.decision === "수용" || r.decision === "부분 수용"));
  const versionOf = (phase: number) => brief.releases.find((v) => v.phase === phase)?.version ?? brief.version;
  const summary = (r: Reading) => {
    const checks = Array.isArray(r.checks) ? (r.checks as CheckAnswer[]) : null;
    const done = checks ? `${r.phase === 0 ? "예상" : "완료"} ${checks.filter((c) => c === "yes").length}/${checks.length}` : `수행값 ${r.value ?? "측정 불가"}`;
    return `${done} · 쉬움 ${r.rating}점`;
  };
  const tabs: [ManagerTab, string, number, IconName][] = [
    ["results", "결과", 0, "chart"],
    ["requests", "요청", pending.length, "inbox"],
    ["students", `학생 ${students.length}명`, 0, "users"],
    ["release", "새 버전 재평가", 0, "refresh"],
    ["guide", "과제 안내", 0, "file"],
  ];

  return (
    <div className="space-y-5">
      {recruiting && (
        <div className={`${ui.panel} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-[15px]">학생 모집 중이에요. 참여할 학생을 선발하면 과제를 시작할 수 있어요.</p>
          <Link className={ui.primary} href={`/dashboard?view=recruit&p=${projectId}`}>신청자 선발하기</Link>
        </div>
      )}

      <nav aria-label="결과 화면 구역" className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--gray-200)]">
        {tabs.map(([id, label, count, icon]) => (
          <Link key={id} href={`/dashboard?view=task&p=${projectId}${id === "results" ? "" : `&tab=${id}`}`}
            aria-current={tab === id ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors ${tab === id
              ? "border-[var(--accent)] font-semibold text-[var(--foreground)]"
              : "border-transparent text-[var(--gray-700)] hover:text-[var(--foreground)]"}`}>
            <Icon name={icon} size={15} />{label}
            {count > 0 && <span className="ml-1.5 inline-block min-w-5 rounded-full bg-[var(--danger)] px-1.5 text-center text-xs font-semibold text-white">{count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "results" && (
        <>
          <Report rows={rows} items={items} phases={[1, ...brief.releases.map((r) => r.phase)]} unit={brief.unit} lowerBetter={brief.lowerBetter} />
          {admin && (
            <div className="flex flex-wrap gap-2">
              <a className={ui.secondary} href={`/dashboard/accompany/${projectId}/export`}><Icon name="download" size={15} className="mr-2" />측정 기록 CSV</a>
              <a className={ui.secondary} href={`/dashboard/accompany/${projectId}/export?kind=chat`}><Icon name="download" size={15} className="mr-2" />대화 기록 CSV</a>
            </div>
          )}
        </>
      )}

      {tab === "requests" && (
        <section className={`${ui.panel} space-y-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">답을 기다리는 요청</h2>
            <p className={ui.hint}>전체 {requests.length}건 · 대기 {pending.length}건</p>
          </div>
          {!pending.length && <p className={`${ui.hint} py-8 text-center`}>지금 답할 요청이 없어요.</p>}
          <ul className="divide-y divide-[var(--gray-100)]">
            {pending.map((r) => {
              const stuck = tasks.find((t) => t.userId === r.userId && t.phase === r.phase)?.incident;
              return (
                <li key={r.id} className="py-6 first:pt-4">
                  <form action={action} className="space-y-4">
                    <input type="hidden" name="op" value="reply" />
                    <input type="hidden" name="tab" value="requests" />
                    <input type="hidden" name="reading" value={r.id} />
                    <div className="flex items-start gap-3">
                      <span className={ui.avatar}>{students.indexOf(r.userId) + 1}</span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-xs text-[var(--muted)]"><span className="font-semibold text-[var(--foreground)]">{alias(r.userId)}</span> · {phaseLabel(r.phase)} · {versionOf(r.phase)} · {summary(r.reading)}</p>
                        <p className={`${ui.tint} whitespace-pre-wrap break-words px-4 py-3 text-base leading-relaxed`}>{r.note}</p>
                        {stuck && <p className={`${ui.badge} bg-[var(--warning-light)] text-[var(--warning)]`}>막힌 곳 · {stuck}</p>}
                        <Shots images={r.reading.images} />
                      </div>
                    </div>
                    <fieldset>
                      <legend className={ui.label}>처리 결과</legend>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {decisions.map((d) => (
                          <label key={d} className="cursor-pointer">
                            <input type="radio" name="decision" value={d} required className="peer sr-only" />
                            <span className={`${pick} ${decisionTone[d]}`}>
                              <span className="block text-sm font-semibold">{d}</span>
                              <span className="block text-xs">{hint[d]}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="block space-y-2">
                      <span className={ui.label}>학생에게 보낼 답</span>
                      <textarea name="reply" className={ui.field} rows={3} required maxLength={1500}
                        placeholder="예: 저장 버튼을 문서 위쪽으로 옮겨 다음 배포에 반영할게요." />
                    </label>
                    <div className="flex justify-end">
                      <ConfirmButton className={ui.primary} message="이 답을 학생에게 보내고 처리 결과를 기록할까요?"><Icon name="send" size={15} className="mr-2" />답 보내기</ConfirmButton>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
          {requests.some((r) => r.repliedAt) && (
            <details className="border-t border-[var(--gray-100)] pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">답한 요청 {requests.filter((r) => r.repliedAt).length}건 보기</summary>
              <ul className="mt-3 divide-y divide-[var(--gray-100)]">
                {requests.filter((r) => r.repliedAt).map((r) => (
                  <li key={r.id} className="space-y-1 py-3 text-sm">
                    <p className="text-xs text-[var(--muted)]">{alias(r.userId)} · {r.decision}{r.deployedPhase !== null && ` · ${versionOf(r.deployedPhase)}에 반영`}{r.recheckedAt && ` · 학생 재확인 ${r.recheckResult}`}</p>
                    <p className="whitespace-pre-wrap break-words">{r.note}</p>
                    <p className="whitespace-pre-wrap break-words text-[var(--muted)]">답: {r.reply}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {tab === "students" && (
        <section className={`${ui.panel} space-y-2`}>
          <h2 className="text-base font-bold">학생별 기록</h2>
          {!students.length && <p className={`${ui.hint} py-8 text-center`}>아직 기록한 학생이 없어요.</p>}
          <ul className="divide-y divide-[var(--gray-100)]">
            {students.map((userId) => {
              const mine = rows.filter((r) => r.userId === userId);
              const usual = mine.find((r) => r.phase === 0)?.note;
              return (
                <li key={userId}>
                  <details className="group py-4">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-3 font-semibold"><span className={ui.avatar}>{students.indexOf(userId) + 1}</span>{alias(userId)}</span>
                      <span className="text-sm text-[var(--muted)]">{mine.map((r) => summary(r)).join("  →  ")} <span aria-hidden="true" className="ml-2 inline-block transition-transform group-open:rotate-90">›</span></span>
                    </summary>
                    <div className="mt-4 grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        {items.length > 1 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-[var(--muted)]">
                                <th className="pb-2 font-medium">완료 조건</th>
                                {mine.map((r) => <th key={r.phase} className="w-16 pb-2 text-center font-medium">{r.phase === 0 ? "예상" : phaseLabel(r.phase)}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--gray-100)]">
                              {items.map((item, i) => (
                                <tr key={item}>
                                  <td className="py-2 pr-2">{item}</td>
                                  {mine.map((r) => {
                                    const c = Array.isArray(r.checks) ? (r.checks[i] as CheckAnswer | undefined) : undefined;
                                    return <td key={r.phase} className={`py-2 text-center font-bold ${c === "yes" ? "text-[var(--success)]" : c === "no" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{c ? mark[c] : "-"}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {usual && <p className="text-sm"><span className="text-[var(--muted)]">평소 방법 · </span>{usual}</p>}
                        {mine.map((r) => <Shots key={r.phase} images={r.images} />)}
                        {mine.flatMap((r) => r.requests).map((q) => (
                          <div key={q.id} className="space-y-1 text-sm">
                            <p className="text-xs text-[var(--muted)]">개선 요청 · {q.reply ? q.decision : "답 대기"}</p>
                            <p className="whitespace-pre-wrap break-words">{q.note}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--gray-50)] p-3">
                        <p className="text-xs font-semibold text-[var(--muted)]">대화 기록</p>
                        <Transcript log={transcripts.find((t) => t.userId === userId && t.phase === mine.at(-1)!.phase)?.transcript} />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === "release" && (
        rows.some((r) => r.phase === latest) ? (
          <form action={action} className={`${ui.panel} space-y-6`}>
            <div className="space-y-1">
              <h2 className="text-base font-bold">고친 버전으로 다시 평가 받기</h2>
              <p className={ui.hint}>서비스를 고쳐 배포했다면 아래를 채워 주세요. 결과를 기록한 학생들에게 알림이 가고, 같은 과제를 새 버전으로 다시 해요. 지금 버전의 기록은 마감돼요.</p>
            </div>
            <input type="hidden" name="op" value="release" />
            <input type="hidden" name="latest" value={latest} />
            <label className="block space-y-2">
              <span className={`${ui.label} flex items-center gap-2`}><span className={ui.num}>1</span>배포한 버전</span>
              <input name="version" className={ui.field} maxLength={80} required placeholder="예: 2026-11-27 배포본" />
            </label>
            <label className="block space-y-2">
              <span className={`${ui.label} flex items-center gap-2`}><span className={ui.num}>2</span>학생에게 알릴 변경 내용</span>
              <textarea name="reply" className={ui.field} rows={3} required maxLength={1500} placeholder="예: 저장 버튼을 문서 위로 옮기고, 저장되면 ‘저장됨’ 표시가 뜨도록 바꿨어요." />
            </label>
            <fieldset className="space-y-2">
              <legend className={`${ui.label} flex items-center gap-2`}><span className={ui.num}>3</span>이번 버전에 반영한 요청</legend>
              <p className={ui.hint}>체크한 요청을 남긴 학생에게 고쳐졌는지 다시 확인을 부탁해요.</p>
              {!linkable.length && <p className={ui.hint}>‘수용’이나 ‘부분 수용’으로 답한 요청이 여기에 나와요.</p>}
              <div className="divide-y divide-[var(--gray-100)]">
                {linkable.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-3 py-3 text-sm">
                    <input type="checkbox" name="implemented" value={r.id} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                    <span className="break-words"><span className="text-xs text-[var(--muted)]">{alias(r.userId)} · {r.decision}</span><br />{r.note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end">
              <ConfirmButton className={ui.primary} message="지금 버전의 기록을 마감하고 새 버전으로 재평가를 요청할까요?"><Icon name="refresh" size={15} className="mr-2" />재평가 요청</ConfirmButton>
            </div>
          </form>
        ) : (
          <p className={`${ui.panel} ${ui.hint} text-center`}>학생이 결과를 기록하면 새 버전 재평가를 요청할 수 있어요.</p>
        )
      )}

      {tab === "guide" && (
        <section className={`${ui.panel} space-y-5`}>
          <h2 className="text-base font-bold">학생에게 공개한 과제</h2>
          <dl className="space-y-4">
            {([["서비스", brief.description], ["과제", brief.task], ["찾고 싶은 문제·개선점", brief.outcome]] as const).map(([k, v]) => (
              <div key={k} className="space-y-1">
                <dt className="text-xs text-[var(--muted)]">{k}</dt>
                <dd className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed ${k === "과제" ? `${ui.tint} px-4 py-3 font-medium` : ""}`}>{v}</dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs text-[var(--muted)]">완료 조건</dt>
              <dd><ol className="space-y-2">{items.map((item, i) => <li key={item} className="flex items-center gap-2 text-[15px]"><span className={ui.num}>{i + 1}</span>{item}</li>)}</ol></dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-[var(--muted)]">버전</dt>
              <dd className="text-[15px]">{brief.releases.at(-1)?.version ?? brief.version}</dd>
            </div>
          </dl>
          {inbox && <OpenScenarioInbox />}
        </section>
      )}
    </div>
  );
}
