"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProjectGuidesInput } from "../components/ProjectGuidesField";
import SubmitButton from "../components/SubmitButton";
import { ui } from "../components/ui";
import FundingFields, { type LinkableOrder } from "./FundingFields";
import {
  createProjectAction,
  createProjectFromServiceAction,
  updateProjectAction,
} from "./actions";
import DashboardQuestionBuilder from "./DashboardQuestionBuilder";
import {
  pad2,
  QTYPE_LABEL,
  timeStrLocal,
  tomorrowStrLocal,
  type DashboardProject,
  type DashboardUser,
  type DraftQuestion,
  type QType,
} from "./dashboardTypes";
import { CreateNav } from "./services/CreateShell";

const FIELD =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
const LABEL = "block text-sm font-semibold text-[var(--foreground)] mb-1.5";

export function CreateAutoProjectView({
  confirmedServices,
  linkableOrders,
  preselectServiceId,
  paramDate,
  frozen,
}: {
  confirmedServices: { id: string; name: string; versionId: string }[];
  linkableOrders: LinkableOrder[];
  preselectServiceId: string;
  paramDate: string;
  frozen: boolean;
}) {
  const [funding, setFunding] = useState("COMPANY");
  const picked = confirmedServices.filter((s) => s.id === preselectServiceId);
  const autoServices = picked.length > 0 ? picked : confirmedServices;

  return (
    <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
      <div className="mb-6">
        <CreateNav
          method="standard"
          step={3}
          date={paramDate || undefined}
          targets={
            picked.length === 1
              ? { 1: { href: "/dashboard/services?method=standard" }, 2: { href: `/dashboard/services/${picked[0].id}` } }
              : { 1: { href: "/dashboard/services?method=standard" } }
          }
        />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] mb-2">표준 설문 모집·비용</h1>
      {frozen ? (
        <p role="status" className="text-sm text-[var(--success)] bg-[var(--success-light)] rounded-[var(--radius-md)] px-4 py-3 mb-6">
          표준 문항을 확정했어요. 일정·인원과 비용 처리를 정해 승인을 요청하면 모집이 시작돼요.
        </p>
      ) : (
        <p className="text-sm text-[var(--muted)] mb-6">
          서비스의 확정한 표준 문항이 이 평가의 문항이 돼요. 일정·인원과 비용 처리를 정해 주세요.
        </p>
      )}

      {confirmedServices.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-sm text-[var(--muted)]">표준 문항을 확정한 서비스가 없어요.</p>
          <Link href="/dashboard/services?method=standard" className={ui.secondary}>
            서비스 등록하고 표준 문항 만들기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {autoServices.map((svc) => (
            <details
              key={svc.id}
              open={autoServices.length === 1}
              className={autoServices.length === 1 ? "group" : "group border border-[var(--gray-200)] rounded-[var(--radius-xl)] overflow-hidden"}
            >
              <summary className={autoServices.length === 1 ? "sr-only" : "flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--surface)] transition-colors list-none"}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)] truncate">{svc.name}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 group-open:hidden">눌러서 일정·인원 정하기</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--gray-500)] transition-transform group-open:rotate-180" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>

              <form
                action={createProjectFromServiceAction}
                onSubmit={(e) => {
                  const fd = new FormData(e.currentTarget);
                  const min = parseInt(String(fd.get("minParticipants") || "1"), 10);
                  const max = parseInt(String(fd.get("maxParticipants") || "0"), 10);
                  const errEl = e.currentTarget.querySelector<HTMLElement>("[data-error]");
                  const msg = !(min >= 1)
                    ? "최소 인원은 1명 이상이어야 합니다."
                    : !(max >= min)
                      ? "정원은 최소 인원보다 적을 수 없습니다."
                      : "";
                  if (errEl) errEl.textContent = msg;
                  if (msg) e.preventDefault();
                }}
                className={autoServices.length === 1 ? "space-y-4" : "px-5 pb-5 pt-4 border-t border-[var(--gray-100)] space-y-4 bg-[var(--surface)]"}
              >
                <input type="hidden" name="versionId" value={svc.versionId} />

                <div>
                  <label htmlFor={`auto-title-${svc.id}`} className={LABEL}>평가 제목</label>
                  <input id={`auto-title-${svc.id}`} name="title" required defaultValue={svc.name} className={FIELD} />
                </div>

                <div>
                  <label htmlFor={`auto-link-${svc.id}`} className={LABEL}>평가할 서비스 주소</label>
                  <input id={`auto-link-${svc.id}`} name="link" inputMode="url" autoComplete="url" placeholder="https://..." className={FIELD} />
                  <p className="text-xs text-[var(--muted)] mt-1">앱처럼 주소가 없으면 비워 두고 아래 안내에 설치·접속 방법을 적어 주세요.</p>
                </div>

                <div>
                  <label htmlFor={`auto-desc-${svc.id}`} className={LABEL}>평가자 안내 (선택)</label>
                  <textarea id={`auto-desc-${svc.id}`} name="description" rows={3} placeholder="접속 방법, 써 볼 기능, 시험용 계정 등" className={`${FIELD} resize-y`} />
                </div>

                <ProjectGuidesInput />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`auto-date-${svc.id}`} className={LABEL}>평가 날짜</label>
                    <input id={`auto-date-${svc.id}`} name="date" type="date" required defaultValue={paramDate || tomorrowStrLocal()} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`auto-time-${svc.id}`} className={LABEL}>시간</label>
                    <input id={`auto-time-${svc.id}`} name="time" type="time" required defaultValue="10:00" className={FIELD} />
                  </div>
                </div>

                <div>
                  <label htmlFor={`auto-loc-${svc.id}`} className={LABEL}>장소</label>
                  <input id={`auto-loc-${svc.id}`} name="location" placeholder="미정이면 비워 두세요" className={FIELD} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`auto-min-${svc.id}`} className={LABEL}>최소 인원</label>
                    <input id={`auto-min-${svc.id}`} name="minParticipants" type="number" min={1} defaultValue={1} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`auto-max-${svc.id}`} className={LABEL}>정원 (최대 인원)</label>
                    <input id={`auto-max-${svc.id}`} name="maxParticipants" type="number" min={1} defaultValue={10} className={FIELD} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`auto-ed-${svc.id}`} className={LABEL}>신청 마감일 (선택)</label>
                    <input id={`auto-ed-${svc.id}`} name="enrollmentDeadlineDate" type="date" className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`auto-et-${svc.id}`} className={LABEL}>신청 마감 시간</label>
                    <input id={`auto-et-${svc.id}`} name="enrollmentDeadlineTime" type="time" defaultValue="23:59" className={FIELD} />
                  </div>
                </div>

                <div className="border-t border-[var(--gray-200)] pt-4">
                  <FundingFields value={funding} onChange={setFunding} orders={linkableOrders} />
                </div>

                <p data-error role="alert" className="text-sm text-[var(--danger)] empty:hidden" />

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                  <p className={`${ui.hint} sm:mr-auto`}>관리자가 승인하면 모집이 시작되고 학생에게 알림이 가요.</p>
                  <SubmitButton pendingText="요청 중…" className={ui.primary}>승인 요청하기</SubmitButton>
                </div>
              </form>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

const MANUAL_STEPS = ["문항 작성", "모집·비용", "검토·승인 요청"];

export function CreateManualProjectView({
  linkableOrders,
  paramDate,
  paramTime,
}: {
  linkableOrders: LinkableOrder[];
  paramDate: string;
  paramTime: string;
}) {
  const [funding, setFunding] = useState("COMPANY");
  const [draftQs, setDraftQs] = useState<DraftQuestion[]>([
    { label: "서비스 사용 경험에 얼마나 만족하나요?", type: "rating", optionsText: "" },
    { label: "사용하면서 가장 개선되었으면 하는 점은 무엇인가요?", type: "text", optionsText: "" },
  ]);
  const [step, setStep] = useState(1);
  const stepChangedAt = useRef(0);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    link: "",
    location: "",
    date: "",
    time: "",
    minParticipants: "1",
    maxParticipants: "10",
    enrollmentDeadlineDate: "",
    enrollmentDeadlineTime: "23:59",
  });

  useEffect(() => {
    // 기기 시간대 기준 기본값이라 마운트 후 채움
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((prev) => ({
      ...prev,
      date: paramDate || tomorrowStrLocal(),
      time: paramTime || timeStrLocal(),
    }));
  }, [paramDate, paramTime]);

  const set = (k: keyof typeof form, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const stepError = (n: number): string => {
    if (n === 1) {
      if (!form.title.trim()) return "평가 제목을 입력하세요.";
      if (draftQs.length === 0) return "평가문항을 최소 1개 추가하세요.";
      for (let i = 0; i < draftQs.length; i++) {
        const q = draftQs[i];
        if (!q.label.trim()) return `${i + 1}번 문항의 제목을 입력하세요.`;
        if (q.type === "dropdown" || q.type === "checkbox") {
          const opts = q.optionsText.split("\n").filter((s) => s.trim());
          if (opts.length < 2) return `${i + 1}번 문항의 선택지를 2개 이상 입력하세요.`;
        }
      }
      return "";
    }
    if (n === 2) {
      if (!form.date || !form.time) return "평가 날짜와 시간을 입력하세요.";
      const min = parseInt(form.minParticipants, 10);
      const max = parseInt(form.maxParticipants, 10);
      if (!(min >= 1)) return "최소 인원은 1명 이상이어야 합니다.";
      if (!(max >= min)) return "최대 인원은 최소 인원보다 적을 수 없습니다.";
    }
    return "";
  };

  const goNext = () => {
    const err = stepError(step);
    if (err) return setError(err);
    setError("");
    stepChangedAt.current = Date.now();
    setStep((s) => s + 1);
  };

  const goPrev = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const guardSubmit = (e: React.FormEvent) => {
    // 같은 자리 버튼 전환 직후의 더블클릭 방지
    if (Date.now() - stepChangedAt.current < 700) {
      e.preventDefault();
      return;
    }
    for (let n = 1; n <= 2; n++) {
      const err = stepError(n);
      if (err) {
        e.preventDefault();
        setError(err);
        setStep(n);
        return;
      }
    }
  };

  return (
    <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
      <div className="mb-6 space-y-4 border-b border-[var(--gray-200)] pb-5">
        <CreateNav
          method="free"
          step={step}
          date={paramDate || undefined}
          targets={Object.fromEntries(
            MANUAL_STEPS.map((_, i) => [
              i + 1,
              {
                onClick: () => {
                  setError("");
                  setStep(i + 1);
                },
              },
            ])
          )}
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">자유 설문 만들기</h1>
          <p className={`${ui.hint} mt-1`}>문항을 직접 써요. 품질 항목별 점수 리포트 대신 응답 원본을 받아요.</p>
        </div>
      </div>

      {/* 비활성 단계도 같은 form 에 남겨 제출 시 함께 전송 */}
      <form action={createProjectAction} onSubmit={guardSubmit} className="space-y-4">
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <div>
            <label htmlFor="create-title" className={LABEL}>평가 제목</label>
            <input
              id="create-title"
              name="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="예) 학습 도우미 챗봇 사용성 평가"
              className={FIELD}
            />
          </div>
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm text-[var(--muted)]">참여 안내와 서비스 주소 추가</summary>
            <div>
              <label htmlFor="create-description" className={LABEL}>설명 (선택)</label>
              <textarea
                id="create-description"
                name="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="평가에 대한 설명을 입력하세요"
                className={`${FIELD} h-20 resize-none`}
              />
            </div>
            <div>
              <label htmlFor="create-link" className={LABEL}>평가할 서비스 주소 (선택)</label>
              <input
                id="create-link"
                name="link"
                type="text"
                inputMode="url"
                value={form.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="https://..."
                className={FIELD}
              />
            </div>
            <ProjectGuidesInput />
          </details>
          <DashboardQuestionBuilder qs={draftQs} setQs={setDraftQs} htmlRequired={false} />
        </div>

        <div className={step === 2 ? "space-y-4" : "hidden"}>
          <div>
            <label htmlFor="create-location" className={LABEL}>평가 장소</label>
            <input
              id="create-location"
              name="location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="장소를 입력하세요"
              className={FIELD}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-date" className={LABEL}>날짜</label>
              <input id="create-date" name="date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="create-time" className={LABEL}>시간</label>
              <input id="create-time" name="time" type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className={FIELD} />
            </div>
          </div>

          <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">참여 신청 설정</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                평가는 모집 상태로 만들어집니다. 신청은 정원을 넘어서도 받고, 이후 신청자 중에서 평가자를 선발합니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="create-min" className={LABEL}>최소 인원</label>
                <input id="create-min" name="minParticipants" type="number" min={1} value={form.minParticipants} onChange={(e) => set("minParticipants", e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="create-max" className={LABEL}>정원 (최대 인원)</label>
                <input id="create-max" name="maxParticipants" type="number" min={1} value={form.maxParticipants} onChange={(e) => set("maxParticipants", e.target.value)} className={FIELD} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="create-enroll-date" className={LABEL}>신청 마감일 (선택)</label>
                <input id="create-enroll-date" name="enrollmentDeadlineDate" type="date" value={form.enrollmentDeadlineDate} onChange={(e) => set("enrollmentDeadlineDate", e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="create-enroll-time" className={LABEL}>신청 마감 시간</label>
                <input id="create-enroll-time" name="enrollmentDeadlineTime" type="time" value={form.enrollmentDeadlineTime} onChange={(e) => set("enrollmentDeadlineTime", e.target.value)} className={FIELD} />
              </div>
            </div>
          </div>
          <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-5">
            <FundingFields value={funding} onChange={setFunding} orders={linkableOrders} />
          </div>
        </div>

        {step === 3 && (
          <div className="space-y-4">
            <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)]">
              {[
                ["제목", form.title],
                ["설명", form.description || "—"],
                ["서비스 주소", form.link || "—"],
                ["장소", form.location || "미정"],
                ["일시", `${form.date} ${form.time}`],
                ["인원", `최소 ${form.minParticipants}명 · 정원 ${form.maxParticipants}명`],
                ["신청 마감", form.enrollmentDeadlineDate ? `${form.enrollmentDeadlineDate} ${form.enrollmentDeadlineTime}` : "제한 없음"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-4 py-2.5">
                  <span className="text-xs text-[var(--muted)] w-20 shrink-0 pt-0.5">{k}</span>
                  <span className="text-sm text-[var(--foreground)] break-all">{v}</span>
                </div>
              ))}
            </div>

            <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-4">
              <p className="text-xs font-semibold text-[var(--gray-600)] mb-2">평가문항 {draftQs.length}개</p>
              <ol className="space-y-1.5">
                {draftQs.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-xs font-mono text-[var(--muted)] pt-0.5">Q{i + 1}</span>
                    <span className="text-[var(--foreground)] flex-1">{q.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)] h-fit shrink-0">
                      {QTYPE_LABEL[q.type]}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <p className="text-xs text-[var(--muted)] text-center">
              요청하면 관리자 승인 대기 상태가 됩니다. 승인되면 모집이 시작되고 평가자에게 알림이 갑니다.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {step > 1 && (
            <button type="button" onClick={goPrev} className={`${ui.secondary} mr-auto`}>
              이전
            </button>
          )}
          {step < 3 ? (
            <button key="next" type="button" onClick={goNext} className={ui.primary}>
              {step === 1 ? "다음: 모집·비용" : "다음: 검토"}
            </button>
          ) : (
            <SubmitButton key="submit" pendingText="요청 중…" className={ui.primary}>
              승인 요청하기
            </SubmitButton>
          )}
        </div>
      </form>
    </div>
  );
}

export function EditProjectView({
  project,
  user,
  onBack,
}: {
  project: DashboardProject;
  user: DashboardUser;
  onBack: () => void;
}) {
  const [editDraftQs, setEditDraftQs] = useState<DraftQuestion[]>(() =>
    (project.questions || []).map((q) => ({
      label: q.label,
      type: q.type as QType,
      optionsText: (q.options || []).join("\n"),
    }))
  );

  const st = new Date(project.startTime);
  const editDate = `${st.getFullYear()}-${pad2(st.getMonth() + 1)}-${pad2(st.getDate())}`;
  const editTime = `${pad2(st.getHours())}:${pad2(st.getMinutes())}`;

  const qs = project.questions;
  const approvedLock =
    user.role !== "ADMIN" && !["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(project.status);
  const locked = approvedLock || (project.responseCount ?? 0) > 0 || qs.some((q) => !!q?.itemKey);
  const accompany = project.evalMode === "ACCOMPANY";
  const minFloor = Math.max(project.minParticipants ?? 1, project.acceptedCount ?? 0, project.responseCount ?? 0);
  const capLocked = project.hasOrder || approvedLock;

  return (
    <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
      <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6">
        &larr; 뒤로
      </button>

      <h1 className="text-xl font-bold text-[var(--foreground)] mb-6">평가 수정</h1>

      <form action={updateProjectAction} className="space-y-4">
        <input type="hidden" name="projectId" value={project.id} />
        {!locked && !accompany && <input type="hidden" name="editQuestions" value="1" />}

        <div>
          <label htmlFor="edit-title" className={LABEL}>평가 제목</label>
          <input id="edit-title" name="title" defaultValue={project.title} required className={FIELD} />
        </div>

        <div>
          <label htmlFor="edit-description" className={LABEL}>설명 (선택)</label>
          <textarea
            id="edit-description"
            name="description"
            defaultValue={project.description || ""}
            placeholder="평가자에게 보일 설명"
            className={`${FIELD} h-20 resize-y`}
          />
        </div>

        <div>
          <label htmlFor="edit-link" className={LABEL}>평가할 서비스 주소 (선택)</label>
          <input
            id="edit-link"
            name="link"
            defaultValue={project.link || ""}
            placeholder="https://..."
            type="text"
            inputMode="url"
            readOnly={approvedLock}
            className={`${FIELD}${approvedLock ? " bg-[var(--gray-50)] text-[var(--muted)]" : ""}`}
          />
          {approvedLock && (
            <p className="mt-1 text-xs text-[var(--muted)]">승인된 평가의 서비스 주소는 관리자에게 변경을 요청해 주세요.</p>
          )}
        </div>

        <ProjectGuidesInput defaultValue={project.guides} readOnly={approvedLock} />

        <div>
          <label htmlFor="edit-location" className={LABEL}>평가 장소</label>
          <input id="edit-location" name="location" defaultValue={project.location ?? ""} placeholder="미정이면 비워 두세요" className={FIELD} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-date" className={LABEL}>날짜</label>
            <input id="edit-date" name="date" type="date" required defaultValue={editDate} className={FIELD} />
          </div>
          <div>
            <label htmlFor="edit-time" className={LABEL}>시간</label>
            <input id="edit-time" name="time" type="time" required defaultValue={editTime} className={FIELD} />
          </div>
        </div>

        <div>
          <label htmlFor="edit-max" className={LABEL}>정원 (최대 인원)</label>
          <input
            id="edit-max"
            name={capLocked ? undefined : "maxParticipants"}
            type="number"
            min={minFloor}
            defaultValue={project.capacity ?? project.maxParticipants}
            required={!capLocked}
            readOnly={capLocked}
            className={`${FIELD}${capLocked ? " bg-[var(--gray-50)] text-[var(--muted)]" : ""}`}
          />
          {project.hasOrder ? (
            <p className="mt-1 text-xs text-[var(--muted)]">연결된 의뢰의 인원({project.capacity}명)이 정원으로 적용돼요.</p>
          ) : approvedLock ? (
            <p className="mt-1 text-xs text-[var(--muted)]">승인된 평가의 정원은 관리자에게 변경을 요청해 주세요.</p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">
              최소 {minFloor}명 이상으로 입력해 주세요. 정원을 늘리면 진행 중에도 추가 신청·배정이 가능해요.
            </p>
          )}
        </div>

        {accompany ? null : locked ? (
          <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-4 sm:p-5">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">평가문항</h3>
              <span className="text-xs text-[var(--muted)]">{qs.length}개 · 수정 불가</span>
            </div>
            <p className="text-sm text-[var(--gray-700)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] mb-3 leading-relaxed">
              {(project.responseCount ?? 0) > 0
                ? `이미 응답이 ${project.responseCount}건 있어 문항을 바꿀 수 없습니다. 바꾸면 기존 응답이 다른 문항에 연결됩니다.`
                : approvedLock
                  ? "승인된 평가는 관리자가 검토한 문항으로 진행됩니다. 문항 변경이 필요하면 관리자에게 요청해 주세요."
                  : "표준 기반으로 구성된 문항은 여기서 고칠 수 없습니다. 서비스의 평가문항을 고친 뒤 새로 만들어 주세요."}
            </p>
            <ol className="space-y-1 text-sm text-[var(--gray-700)] max-h-60 overflow-y-auto">
              {qs.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--muted)] w-6 shrink-0 text-right">{i + 1}.</span>
                  <span className="flex-1">{q.type === "semantic7" ? `${q.leftLabel} ↔ ${q.rightLabel}` : q.label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <DashboardQuestionBuilder qs={editDraftQs} setQs={setEditDraftQs} />
        )}

        {project.status === "REJECTED" && (
          <p className="text-xs text-[var(--muted)]">저장하면 관리자에게 다시 승인을 요청해요.</p>
        )}
        <SubmitButton pendingText="저장 중…" className={`${ui.primary} w-full`}>
          {project.status === "REJECTED" ? "고쳐서 다시 승인 요청" : "저장"}
        </SubmitButton>
      </form>
    </div>
  );
}
