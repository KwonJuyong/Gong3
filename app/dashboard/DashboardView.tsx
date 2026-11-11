"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  finishProjectAction,
  createProjectAction,
  createProjectFromServiceAction,
  deleteProjectAction,
  updateProjectAction,
  enrollProjectAction,
  cancelEnrollmentAction,
} from "./actions";
import {
  sendMessageAction,
  sendProjectAnnouncementAction,
} from "../actions";
import CreateSteps from "./services/CreateSteps";
import RecruitPanel from "./RecruitPanel";
import EvalForm from "./EvalForm";
import EvalServiceLink from "./EvalServiceLink";
import { questionKey, commentKey, type ProjectQuestion } from "../lib/projectQuestions";
import SubmitButton from "../components/SubmitButton";
import { confirmSubmit, toast } from "../components/feedback";
import { useEscape } from "../components/useEscape";

// 수동 생성 폼의 문항 유형. 자동 구성 문항 유형까지 포함한 목록은 app/lib/projectQuestions.ts.
type QType = "rating" | "text" | "dropdown" | "checkbox" | "image";
type Question = ProjectQuestion;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function todayStrLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function timeStrLocal() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 평가 상태 → 화면 라벨·색. 상태 표시는 모두 이 함수를 씀 */
export function statusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case "PENDING_APPROVAL":
      return { label: "승인 대기", cls: "bg-[var(--warning-light)] text-[var(--warning)]" };
    case "REJECTED":
      return { label: "반려", cls: "bg-[var(--danger-light)] text-[var(--danger)]" };
    case "DRAFT":
      return { label: "작성 중", cls: "bg-[var(--gray-100)] text-[var(--gray-600)]" };
    case "RECRUITING":
      return { label: "모집 중", cls: "bg-[var(--accent)] text-white" };
    case "ACTIVE":
      return { label: "진행 중", cls: "bg-[var(--success-light)] text-[var(--success)]" };
    case "FINISHED":
      return { label: "종료", cls: "bg-[var(--gray-100)] text-[var(--gray-600)]" };
    default:
      return { label: status, cls: "bg-[var(--gray-100)] text-[var(--gray-600)]" };
  }
}

/** 문항 유형 → 표시 이름(미리보기·검토·결과 공용) */
const QTYPE_LABEL: Record<string, string> = {
  rating: "별점(1~5)",
  likert5: "동의 척도(5점)",
  semantic7: "의미 척도(7점)",
  scale: "숫자 척도",
  text: "서술형",
  dropdown: "목록에서 1개",
  checkbox: "복수 선택",
  image: "이미지 업로드",
};

/** 생성자 정보 표시 컴포넌트 */
function CreatorBadge({ project }: { project: DashboardProject }) {
  if (!project.creatorName) return null;
  const typeLabel = project.creatorUserType === "DEVELOPER" ? "기업" : project.creatorUserType === "STAFF" ? "교직원" : "";
  const majorLabel = project.creatorMajor || "";
  return (
    <p className="flex items-center gap-1.5 mt-2 text-xs text-[var(--muted)]">
      <span>개설</span>
      <span className="text-[var(--foreground)] font-medium">{project.creatorName}</span>
      {typeLabel && <span className="px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-700)]">{typeLabel}</span>}
      {majorLabel && <span>· {majorLabel}</span>}
    </p>
  );
}

/**
 * 비용 부담 선택(자동·수동 생성 폼 공용). 생성 방식과는 별개임
 * 공개 여부와는 무관하고 보상 지급 경로만 정함
 */
const FUNDING_OPTIONS = [
  {
    value: "COMPANY",
    label: "외부 의뢰형: 기업",
    hint: "평가 의뢰·입금으로 비용이 마련됩니다(선불). 참여 보상은 플랫폼이 지급합니다.",
  },
  {
    value: "UNIVERSITY",
    label: "외부 의뢰형: 교육기관 계약",
    hint: "계약으로 진행하고 대금은 검수 후에 들어옵니다(후불). 참여 보상은 플랫폼이 먼저 지급합니다.",
  },
  {
    value: "RESEARCH_FUND",
    label: "연구과제형: 연구비",
    hint: "평가 의뢰 없이 진행합니다. 평가가 끝난 뒤 참여 보상을 청구하며, 지급은 산학협력단이 합니다.",
  },
];

export type DashboardUser = {
  id: string;
  studentId: string;
  name: string;
  role: string;
  userType: string;
};

export type DashboardProject = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  questions: Question[];
  link: string | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorMajor: string | null;
  creatorUserType: string | null;
  minParticipants: number;
  maxParticipants: number;
  capacity: number;
  rewardPerPerson: number;
  rejectReason: string | null;
  enrollmentDeadline: string | null;
  responseCount: number;
  enrollmentCount: number;
  acceptedCount: number;
  responses: {
    id: string;
    userId: string;
    userName: string | null;
    userStudentId: string;
    answers: Record<string, unknown>;
  }[];
  enrollments: {
    id: string;
    userId: string;
    userName: string;
    userStudentId: string;
    userMajor: string;
    userResponseCount: number;
    status: string;
    createdAt: string;
  }[];
};

export type LinkableOrder = {
  id: string;
  orderNo: string;
  serviceName: string;
  panelSize: number;
  rewardPerPerson: number;
  paid: boolean;
};

function FundingFields({
  value,
  onChange,
  orders,
}: {
  value: string;
  onChange: (v: string) => void;
  orders: LinkableOrder[];
}) {
  const opt = FUNDING_OPTIONS.find((o) => o.value === value) ?? FUNDING_OPTIONS[0];
  const needsOrder = value === "COMPANY" || value === "UNIVERSITY";
  const box =
    "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";
  return (
    <div className="space-y-2">
      <label htmlFor="funding-type" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5">
        비용 부담
      </label>
      <select
        id="funding-type"
        name="fundingType"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={box}
      >
        {FUNDING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--muted)] leading-relaxed">{opt.hint}</p>

      {value === "UNIVERSITY" && (
        <input name="contractRef" placeholder="계약번호 (선택)" aria-label="계약번호" className={box} />
      )}
      {value === "RESEARCH_FUND" && (
        <input name="fundRef" placeholder="과제번호 (선택)" aria-label="과제번호" className={box} />
      )}

      {/* 발주는 나중에 연결할 수 있음. 연결 전에는 보상이 생기지 않음 */}
      {needsOrder &&
        (orders.length > 0 ? (
          <div>
            <label htmlFor="link-order" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5">
              연결할 평가 의뢰 <span className="text-[var(--muted)] font-normal">(선택)</span>
            </label>
            <select id="link-order" name="orderId" className={box} defaultValue="">
              <option value="">선택 안 함 (나중에 연결)</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} · {o.serviceName} · {o.panelSize}명 ×{" "}
                  {o.rewardPerPerson.toLocaleString("ko-KR")}원{o.paid ? " · 입금완료" : " · 입금대기"}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
              의뢰의 인원·단가가 이 평가의 <strong>정원과 보상</strong>이 됩니다. 지금 고르지
              않아도 <strong>나중에 연결</strong>할 수 있고, 그때 기존 응답분도 소급 지급됩니다.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
            연결할 평가 의뢰가 없습니다. 평가는 <strong>승인만 되면 공개</strong>되지만, 의뢰가
            연결되어야 참여 보상이 생깁니다. {" "}
            <Link href="/dashboard/orders" className="underline font-semibold">
              평가 의뢰
            </Link>
            는 나중에 진행해 연결해도 됩니다.
          </p>
        ))}
    </div>
  );
}

export default function DashboardView({
  projects,
  user,
  confirmedServices = [],
  linkableOrders = [],
}: {
  projects: DashboardProject[];
  user: DashboardUser;
  confirmedServices?: { id: string; name: string; versionId: string }[];
  /** 아직 평가에 연결되지 않은 내 발주 */
  linkableOrders?: LinkableOrder[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const view = (sp.get("view") || "list") as
    | "list"
    | "detail"
    | "eval"
    | "result"
    | "create"
    | "create-auto"
    | "recruit"
    | "edit";
  const selectedId = sp.get("p");
  // 평가 생성 직후: 승인 대기 안내
  const submitted = sp.get("submitted") === "1";
  // 정원이 차서 응답이 거절된 경우.
  const full = sp.get("full") === "1";
  // 서버 검증에서 응답이 거절된 경우(빈 문항·범위 밖 값)
  const invalid = sp.get("invalid") === "1";
  // 신청을 눌렀는데 그 사이 모집이 끝난 경우
  const enrollClosed = sp.get("enroll") === "closed";
  // 응답 제출 직후(서버 액션이 붙여 보냄)
  const answered = sp.get("answered");
  const paramDate = sp.get("d") || "";
  const paramTime = sp.get("t") || "";
  // 평가 만들기 화면에서 서비스를 골라 들어온 경우
  const preselectServiceId = sp.get("s") || "";

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (projects || []).find((p) => p.id === selectedId) || null;
  }, [projects, selectedId]);

  const [viewDate, setViewDate] = useState(new Date());
  // 일정 보기. 기본은 목록이고 달력으로 바꾸면 이 기기에 기억함
  const [calMode, setCalMode] = useState<"list" | "calendar">("list");
  useEffect(() => {
    try {
      // 기기 저장값은 서버 렌더에서 읽을 수 없어 마운트 후 반영
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("dash-cal-mode") === "calendar") setCalMode("calendar");
    } catch {}
  }, []);
  const pickCalMode = (m: "list" | "calendar") => {
    setCalMode(m);
    try {
      localStorage.setItem("dash-cal-mode", m);
    } catch {}
  };
  const [splitUrl, setSplitUrl] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(50); // 좌측 패널 %
  const [dragging, setDragging] = useState(false);

  // 비용 부담. 자동·수동 생성 폼이 함께 씀
  const [funding, setFunding] = useState("COMPANY");

  const [draftQs, setDraftQs] = useState<
    Array<{ label: string; type: QType; optionsText: string }>
  >([
    { label: "전반 만족도", type: "rating", optionsText: "" },
    { label: "개선/의견", type: "text", optionsText: "" },
  ]);

  const [editDraftQs, setEditDraftQs] = useState<
    Array<{ label: string; type: QType; optionsText: string }>
  >([]);

  // 생성 마법사: 4스텝(기본 정보 → 일정·모집 → 평가 항목 → 검토).
  // 모든 스텝의 입력이 한 <form> 안에 남아 있어야 서버 액션에 함께 전송되므로,
  // 비활성 스텝은 언마운트하지 않고 숨김. 따라서 값은 상태로 들고 있음
  const [createStep, setCreateStep] = useState(1);
  const stepChangedAt = useRef(0);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
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

  const editSource = view === "edit" ? selected : null;
  const [editSynced, setEditSynced] = useState<typeof selected>(null);
  if (editSource !== editSynced) {
    setEditSynced(editSource);
    if (editSource) {
      const qs = (editSource.questions || []) as Question[];
      setEditDraftQs(
        qs.map((q) => ({
          label: q.label,
          // 편집기는 수동 문항만 다룸(표준 구성 문항은 잠겨 있음).
          type: q.type as QType,
          optionsText: (q.options || []).join("\n"),
        }))
      );
    }
  }

  // 뷰 변경 시 분할 상태 초기화
  const splitKey = `${view}:${selectedId}`;
  const [splitFor, setSplitFor] = useState(splitKey);
  if (splitKey !== splitFor) {
    setSplitFor(splitKey);
    setSplitUrl(null);
    setSplitRatio(50);
    setDragging(false);
  }

  // 생성 뷰 진입 시 마법사를 처음부터. 빈 날짜 모달에서 넘어온 d/t 파라미터를 반영함
  useEffect(() => {
    if (view !== "create") return;
    // 오늘 날짜·시각은 기기 시간대 기준이라 서버 렌더가 아닌 마운트 후 채움
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCreateStep(1);
    setCreateError("");
    setCreateForm((prev) => ({
      ...prev,
      date: paramDate || todayStrLocal(),
      time: paramTime || timeStrLocal(),
    }));
  }, [view, paramDate, paramTime]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const questions: Question[] = useMemo(() => {
    const qs = (selected?.questions || []) as Question[];
    return Array.isArray(qs) ? qs : [];
  }, [selected]);

  function go(url: string) {
    router.push(url, { scroll: false });
  }
  // 「뒤로」·모달 닫기. 링크로 바로 들어와 이전 화면이 없으면 대시보드로 보냄
  const closeByBack = useCallback(() => {
    const cameFromApp = document.referrer.startsWith(window.location.origin);
    if (window.history.length > 1 && cameFromApp) router.back();
    else router.push("/dashboard", { scroll: false });
  }, [router]);

  function openDetail(p: DashboardProject) {
    go(`/dashboard?view=detail&p=${p.id}`);
  }

  // 빈 날짜를 누르면 그 날짜로 평가 만들기(개설 권한이 있을 때만)
  function createOn(dateYYYYMMDD: string) {
    go(`/dashboard?view=create&d=${encodeURIComponent(dateYYYYMMDD)}&t=10:00`);
  }

  // 상세 모달: Esc 로 닫고, 떠 있는 동안 뒤 화면이 스크롤되지 않게 함
  useEscape(view === "detail", closeByBack);
  useEffect(() => {
    if (view !== "detail") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [view]);

  const canEdit = (p: DashboardProject) =>
    user.role === "ADMIN" || (p.creatorId && p.creatorId === user.id);

  const canExport = (p: DashboardProject) =>
    user.role === "ADMIN" || (p.creatorId && p.creatorId === user.id);

  // 문항 편집기(생성·수정 공용).
  // htmlRequired: 마법사는 숨긴 스텝의 입력도 폼에 남겨 두는데, 숨겨진 입력에 required 가 있으면
  // 브라우저가 제출을 막으므로 false 로 넘기고 직접 검증함
  // 문항이 하나도 없으면 저장할 수 없어서 마지막 문항은 지울 수 없게 했음
  function renderQuestionBuilder(
    qs: Array<{ label: string; type: QType; optionsText: string }>,
    setQs: Dispatch<
      SetStateAction<
        Array<{ label: string; type: QType; optionsText: string }>
      >
    >,
    htmlRequired = true
  ) {
    const move = (i: number, d: -1 | 1) =>
      setQs((prev) => {
        const j = i + d;
        if (j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    const iconBtn =
      "w-10 h-10 shrink-0 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:bg-[var(--gray-50)] disabled:opacity-40 disabled:cursor-not-allowed";
    return (
      <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-4 sm:p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">평가문항</h3>
          <span className="text-xs text-[var(--muted)]">{qs.length}개</span>
        </div>

        {qs.map((q, i) => (
          <div
            key={i}
            className="bg-[var(--surface)] p-3 sm:p-4 rounded-[var(--radius-md)] border border-[var(--gray-200)] space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 text-xs font-semibold text-[var(--muted)] shrink-0 text-center">{i + 1}</span>
              <input
                name={`q_label_${i}`}
                value={q.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setQs((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, label: v } : x))
                  );
                }}
                placeholder="질문을 입력하세요"
                aria-label={`${i + 1}번 문항 질문`}
                required={htmlRequired}
                className="flex-1 min-w-0 px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
              />
            </div>

            <div className="flex gap-2 pl-8">
              <select
                name={`q_type_${i}`}
                value={q.type}
                aria-label={`${i + 1}번 문항 응답 방식`}
                onChange={(e) => {
                  const v = e.target.value as QType;
                  setQs((prev) =>
                    prev.map((x, idx) =>
                      idx === i ? { ...x, type: v } : x
                    )
                  );
                }}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              >
                <option value="rating">별점 (1~5)</option>
                <option value="text">서술형</option>
                <option value="dropdown">보기 중 1개 선택</option>
                <option value="checkbox">보기 중 여러 개 선택</option>
                <option value="image">이미지 업로드</option>
              </select>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 문항 위로`} className={iconBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === qs.length - 1} aria-label={`${i + 1}번 문항 아래로`} className={iconBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setQs((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={qs.length <= 1}
                aria-label={`${i + 1}번 문항 삭제`}
                title={qs.length <= 1 ? "문항은 1개 이상 있어야 합니다" : "삭제"}
                className={`${iconBtn} hover:text-[var(--danger)] hover:border-[var(--danger)]`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </div>

            {(q.type === "dropdown" || q.type === "checkbox") && (
              <div className="pl-8">
                <textarea
                  name={`q_options_${i}`}
                  value={q.optionsText}
                  aria-label={`${i + 1}번 문항 보기 (한 줄에 하나)`}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQs((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, optionsText: v } : x
                      )
                    );
                  }}
                  placeholder={"보기를 한 줄에 하나씩 입력\n예) 매우 좋음\n좋음\n보통\n나쁨"}
                  required={htmlRequired}
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm h-24 resize-y outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]"
                />
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setQs((prev) => [
              ...prev,
              { label: "", type: "text", optionsText: "" },
            ])
          }
          className="w-full py-3 rounded-[var(--radius-md)] border border-dashed border-[var(--gray-300)] text-sm font-medium text-[var(--gray-700)] hover:bg-[var(--gray-50)] hover:border-[var(--gray-500)] transition-colors"
        >
          + 문항 추가
        </button>
      </div>
    );
  }

  if (view === "eval" && selected) {
    // 응답 권한 확인(submitResponseAction 과 같은 조건)
    const myEnrollment = (selected.enrollments || []).find((e) => e.userId === user.id);
    if (selected.status !== "ACTIVE" || myEnrollment?.status !== "ACCEPTED") {
      return (
        <div className="bg-white rounded-[var(--radius-xl)] p-8 text-center">
          <p className="text-sm text-[var(--gray-700)]">
            {selected.status === "RECRUITING"
              ? "아직 모집 중인 평가입니다. 선발 결과를 기다려 주세요."
              : "이 평가에 응답할 권한이 없습니다."}
          </p>
          <button onClick={closeByBack} className="mt-4 text-sm font-medium text-[var(--foreground)] underline">
            돌아가기
          </button>
        </div>
      );
    }

    // 기존 응답 확인 (수정 모드)
    const myResponse = (selected.responses || []).find((r) => r.userId === user.id);
    const prevAnswers = (myResponse?.answers ?? {}) as Record<string, unknown>;

    const toolbar = (
      <div className="flex items-center justify-between gap-2 mb-5">
        <button
          onClick={() => {
            setSplitUrl(null);
            closeByBack();
          }}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          &larr; 뒤로
        </button>

        {selected.link && splitUrl && (
          <button
            type="button"
            onClick={() => setSplitUrl(null)}
            className="px-3.5 py-2 rounded-[10px] bg-[var(--gray-100)] text-[var(--gray-700)] text-sm font-medium hover:bg-[var(--gray-200)] transition-colors"
          >
            분할 닫기
          </button>
        )}
      </div>
    );

    const serviceIntro = selected.link ? (
      <EvalServiceLink projectId={selected.id} link={selected.link} split={!!splitUrl} onSplit={() => setSplitUrl(selected.link)} />
    ) : null;

    const form = (stickyTop: string) => (
      <EvalForm
        project={{ id: selected.id, title: selected.title, location: selected.location ?? undefined }}
        userId={user.id}
        questions={questions}
        prevAnswers={prevAnswers}
        alreadyAnswered={!!myResponse}
        stickyTop={stickyTop}
        intro={serviceIntro}
      />
    );

    if (splitUrl) {
      return (
        <div
          className="fixed inset-0 z-50 flex bg-white"
          style={{ top: "56px" }}
          onMouseMove={(e) => {
            if (!dragging) return;
            const container = e.currentTarget;
            const rect = container.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setSplitRatio(Math.min(80, Math.max(20, pct)));
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          <div className="overflow-y-auto px-5 sm:px-8 py-6" style={{ width: `${splitRatio}%` }}>
            <div className="max-w-[700px] mx-auto">
              {toolbar}
              {form("top-0")}
            </div>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="칸 너비 조절"
            className="w-1.5 bg-[var(--gray-200)] hover:bg-[var(--accent)] cursor-col-resize shrink-0 transition-colors flex items-center justify-center"
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
          >
            <div className="w-0.5 h-8 bg-[var(--gray-400)] rounded-full" />
          </div>
          <div className="relative" style={{ width: `${100 - splitRatio}%` }}>
            {/* 프레임 표시를 막는 서비스(X-Frame-Options)는 이 칸이 비어 보이므로 안내함 */}
            <p className="absolute top-0 inset-x-0 z-10 text-xs text-[var(--gray-700)] bg-[var(--gray-50)] border-b border-[var(--gray-200)] px-3 py-1.5">
              화면이 비어 있으면 그 서비스가 다른 사이트 안에서 열리는 것을 막아 둔 것입니다. {" "}
              <a href={splitUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                새 탭에서 열기
              </a>
            </p>
            <iframe
              src={splitUrl}
              className="w-full h-full border-0 pt-7"
              title="평가할 서비스"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              style={{ pointerEvents: dragging ? "none" : "auto" }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8 max-w-[760px] mx-auto">
        {toolbar}
        {form("top-14")}
      </div>
    );
  }

  if (view === "result" && selected) {
    if (user.role !== "ADMIN" && user.id !== selected.creatorId) {
      return (
        <div className="bg-white rounded-[var(--radius-xl)] p-8 text-center">
          <p className="text-[var(--danger)] font-medium mb-4">결과를 볼 권한이 없습니다.</p>
          <button onClick={closeByBack} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">&larr; 뒤로</button>
        </div>
      );
    }
    return (
      <div className="bg-white rounded-[var(--radius-xl)] p-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={closeByBack}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            &larr; 뒤로
          </button>

          {canExport(selected) ? (
            <a
              href={`/api/export?projectId=${selected.id}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              내보내기
            </a>
          ) : (
            <p className="text-xs text-[var(--muted)]">내보내기는 개설자·관리자만 할 수 있습니다.</p>
          )}
        </div>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-1">{selected.title}</h1>
        <p className="text-sm text-[var(--muted)] mb-8">결과 · 응답 {selected.responseCount ?? 0}건</p>

        <div className="space-y-4">
          {(questions || []).map((q, i) => {
            const res = selected.responses || [];

            // 응답 키는 questionKey() 로 만듦(수동은 인덱스, 설문 원본은 itemKey).
            const key = questionKey(q, i);

            const scores = res
              .map((r) => Number(r.answers?.[key]))
              .filter((s: number) => !isNaN(s));
            const avg =
              scores.length > 0
                ? (
                    scores.reduce((a: number, b: number) => a + b, 0) /
                    scores.length
                  ).toFixed(1)
                : // 응답이 없으면 0.0 대신 표시하지 않음
                  "—";

            // 척도 문항은 평균을 그림. semantic7 은 7점, rating·likert5 는 5점, scale 은 문항의 범위.
            const isScale =
              q.type === "rating" || q.type === "likert5" || q.type === "semantic7" || q.type === "scale";
            const scaleMin = q.type === "scale" ? (q.scaleMin ?? 1) : 1;
            const scaleMax = q.type === "scale" ? (q.scaleMax ?? 7) : q.type === "semantic7" ? 7 : 5;

            // 평균만으로는 분포를 알 수 없어 점수별 분포도 그림
            const dist: number[] = [];
            if (isScale) {
              for (let v = scaleMin; v <= scaleMax; v++) {
                dist.push(scores.filter((s: number) => Math.round(s) === v).length);
              }
            }

            const { itemKey } = q;
            const comments = itemKey
              ? res
                  .map((r) => ({
                    text: String(r.answers?.[commentKey(itemKey)] ?? "").trim(),
                    userName: r.userName,
                    userStudentId: r.userStudentId,
                  }))
                  .filter((c) => c.text)
              : [];

            const counts: Record<string, number> = {};
            if (q.type === "dropdown" || q.type === "checkbox") {
              for (const r of res) {
                const v = r.answers?.[key];
                const arr = Array.isArray(v) ? v : v ? [v] : [];
                for (const x of arr)
                  counts[String(x)] = (counts[String(x)] || 0) + 1;
              }
            }

            return (
              <div
                key={i}
                className="p-5 bg-[var(--surface)] rounded-[var(--radius-lg)]"
              >
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  <span className="text-[var(--muted)] font-normal mr-1.5">{i + 1}.</span>
                  {q.type === "semantic7" ? `${q.leftLabel} ↔ ${q.rightLabel}` : q.label}
                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">{QTYPE_LABEL[q.type] ?? ""}</span>
                </h3>

                {isScale ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-[var(--accent)]">
                        {avg}
                      </span>
                      <span className="text-sm text-[var(--gray-500)]">
                        / {scaleMax}.0
                      </span>
                      <span className="text-xs text-[var(--gray-500)] ml-2">
                        응답 {scores.length}명
                      </span>
                    </div>
                    <div className="flex items-end gap-1 h-12">
                      {dist.map((n, v) => {
                        const ratio = scores.length > 0 ? n / scores.length : 0;
                        return (
                          <div key={v} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t-sm bg-[var(--accent)]"
                              style={{
                                // 0명이어도 막대가 보이도록 최소 높이를 줌
                                height: `${Math.max(2, Math.round(ratio * 36))}px`,
                                opacity: n > 0 ? 1 : 0.15,
                              }}
                            />
                            <span className="text-xs text-[var(--gray-500)]">
                              {v + scaleMin}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* 서술형 개선 의견(text:<itemKey>) */}
                    {comments.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {comments.map((c, idx) => (
                          <div
                            key={idx}
                            className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)]"
                          >
                            <p className="text-sm text-[var(--gray-600)]">{c.text}</p>
                            <p className="text-xs text-[var(--gray-500)] mt-1">
                              {c.userName || "익명"} ({c.userStudentId || "-"})
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : q.type === "dropdown" || q.type === "checkbox" ? (
                  <div className="space-y-1.5">
                    {(q.options || []).map((opt: string, idx: number) => (
                      <div
                        key={idx}
                        className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex justify-between items-center"
                      >
                        <span className="text-sm text-[var(--foreground)]">
                          {opt}
                        </span>
                        <span className="text-sm font-semibold text-[var(--accent)]">
                          {counts[opt] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : q.type === "image" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(res || []).map((r, idx) => {
                      const url = String(r.answers?.[key] ?? "").trim();
                      if (!url || (!url.startsWith("/uploads/") && !url.startsWith("/api/uploads/"))) return null;
                      return (
                        <div key={idx} className="space-y-1">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--gray-200)] hover:border-[var(--accent)] transition-colors"
                          >
                            <img
                              src={url}
                              alt={`응답 ${idx + 1}`}
                              className="max-h-48 w-full object-cover"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = "none";
                                target.parentElement!.innerHTML = `<div class="flex items-center justify-center h-32 bg-gray-50 text-xs text-gray-400">이미지를 불러올 수 없습니다</div>`;
                              }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 text-white text-xs bg-black/50 px-2 py-1 rounded transition-opacity">
                                크게 보기
                              </span>
                            </div>
                          </a>
                          <p className="text-xs text-[var(--gray-500)] truncate">{r.userName || "익명"} ({r.userStudentId || "-"})</p>
                        </div>
                      );
                    })}
                    {(res || []).filter((r) => {
                      const v = String(r.answers?.[key] ?? "").trim();
                      return v && (v.startsWith("/uploads/") || v.startsWith("/api/uploads/"));
                    }).length === 0 && (
                      <p className="text-sm text-[var(--gray-500)] col-span-full">
                        제출된 이미지가 없습니다
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(res || []).map((r, idx) => (
                      <div
                        key={idx}
                        className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)]"
                      >
                        <p className="text-sm text-[var(--gray-600)]">{String(r.answers?.[key] ?? "")}</p>
                        <p className="text-xs text-[var(--gray-500)] mt-1">{r.userName || "익명"} ({r.userStudentId || "-"})</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "recruit" && selected && canEdit(selected)) {
    return <RecruitPanel project={selected} onBack={closeByBack} isAdmin={user.role === "ADMIN"} />;
  }

  if (view === "create-auto") {
    const field =
      "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors";
    const labelCls = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";
    // 서비스를 정하고 들어왔으면 그 서비스의 폼만 보여줌
    const picked = confirmedServices.filter((s) => s.id === preselectServiceId);
    const autoServices = picked.length > 0 ? picked : confirmedServices;
    return (
      <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
        <Link
          href="/dashboard/services"
          className="inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6"
        >
          &larr; 평가 만들기
        </Link>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">일정과 인원 정하기</h1>
        <div className="mb-3">
          <CreateSteps current={3} />
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">
          서비스의 확정된 평가문항이 이 평가의 문항이 됩니다. 일정과 인원만 정해 주세요.
        </p>

        {confirmedServices.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm text-[var(--muted)]">확정된 평가문항이 있는 서비스가 없습니다.</p>
            <Link
              href="/dashboard/services"
              className="inline-block text-sm px-4 py-2 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] hover:bg-[var(--gray-50)] transition-colors"
            >
              서비스 등록하고 평가문항 만들기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {autoServices.map((svc) => (
              <details
                key={svc.id}
                open={autoServices.length === 1}
                className="group border border-[var(--gray-200)] rounded-[var(--radius-xl)] overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-[var(--surface)] transition-colors list-none">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{svc.name}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">눌러서 일정·인원 정하기</p>
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
                  className="px-5 pb-5 pt-4 border-t border-[var(--gray-100)] space-y-4 bg-[var(--surface)]"
                >
                  <input type="hidden" name="versionId" value={svc.versionId} />

                  <div>
                    <label htmlFor={`auto-title-${svc.id}`} className={labelCls}>평가 제목</label>
                    <input id={`auto-title-${svc.id}`} name="title" required defaultValue={svc.name} className={field} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`auto-date-${svc.id}`} className={labelCls}>평가 날짜</label>
                      <input id={`auto-date-${svc.id}`} name="date" type="date" required defaultValue={todayStrLocal()} className={field} />
                    </div>
                    <div>
                      <label htmlFor={`auto-time-${svc.id}`} className={labelCls}>시간</label>
                      <input id={`auto-time-${svc.id}`} name="time" type="time" required defaultValue="10:00" className={field} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor={`auto-loc-${svc.id}`} className={labelCls}>장소</label>
                    <input id={`auto-loc-${svc.id}`} name="location" placeholder="미정이면 비워 두세요" className={field} />
                  </div>

                  <FundingFields value={funding} onChange={setFunding} orders={linkableOrders} />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`auto-min-${svc.id}`} className={labelCls}>최소 인원</label>
                      <input id={`auto-min-${svc.id}`} name="minParticipants" type="number" min={1} defaultValue={1} className={field} />
                    </div>
                    <div>
                      <label htmlFor={`auto-max-${svc.id}`} className={labelCls}>정원 (최대 인원)</label>
                      <input id={`auto-max-${svc.id}`} name="maxParticipants" type="number" min={1} defaultValue={10} className={field} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`auto-ed-${svc.id}`} className={labelCls}>신청 마감일 (선택)</label>
                      <input id={`auto-ed-${svc.id}`} name="enrollmentDeadlineDate" type="date" className={field} />
                    </div>
                    <div>
                      <label htmlFor={`auto-et-${svc.id}`} className={labelCls}>신청 마감 시간</label>
                      <input id={`auto-et-${svc.id}`} name="enrollmentDeadlineTime" type="time" defaultValue="23:59" className={field} />
                    </div>
                  </div>

                  <p data-error role="alert" className="text-sm text-[var(--danger)] empty:hidden" />

                  <SubmitButton
                    pendingText="요청 중…"
                    className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
                  >
                    승인 요청하기
                  </SubmitButton>
                  <p className="text-xs text-[var(--muted)] text-center">
                    관리자가 승인하면 모집이 시작되고 평가자에게 알림이 갑니다.
                  </p>
                </form>
              </details>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "create") {
    const STEPS = ["기본 정보", "일정·모집", "평가문항", "검토"];
    const field = "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
    const labelCls = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";
    const set = (k: keyof typeof createForm, v: string) =>
      setCreateForm((prev) => ({ ...prev, [k]: v }));

    // 스텝별 검증. 숨겨진 입력에는 required 를 걸 수 없으므로 직접 확인함
    const stepError = (n: number): string => {
      if (n === 1) {
        return createForm.title.trim() ? "" : "평가 제목을 입력하세요.";
      }
      if (n === 2) {
        if (!createForm.date || !createForm.time) return "평가 날짜와 시간을 입력하세요.";
        const min = parseInt(createForm.minParticipants, 10);
        const max = parseInt(createForm.maxParticipants, 10);
        if (!(min >= 1)) return "최소 인원은 1명 이상이어야 합니다.";
        if (!(max >= min)) return "최대 인원은 최소 인원보다 적을 수 없습니다.";
        return "";
      }
      if (n === 3) {
        if (draftQs.length === 0) return "평가문항을 최소 1개 추가하세요.";
        for (let i = 0; i < draftQs.length; i++) {
          const q = draftQs[i];
          if (!q.label.trim()) return `${i + 1}번 문항의 제목을 입력하세요.`;
          if (q.type === "dropdown" || q.type === "checkbox") {
            const opts = q.optionsText.split("\n").filter((s) => s.trim());
            if (opts.length < 2) return `${i + 1}번 문항의 선택지를 2개 이상 입력하세요.`;
          }
        }
      }
      return "";
    };

    const goNext = () => {
      const err = stepError(createStep);
      if (err) return setCreateError(err);
      setCreateError("");
      stepChangedAt.current = Date.now();
      setCreateStep((s) => s + 1);
    };
    const goPrev = () => {
      setCreateError("");
      setCreateStep((s) => s - 1);
    };
    // 검토 단계에서 제출하기 전에 앞선 스텝을 다시 확인함(뒤로 가서 지웠을 수 있음)
    const guardSubmit = (e: React.FormEvent) => {
      // 「다음」과 「승인 요청하기」가 같은 자리라, 단계가 바뀐 직후의 제출은 더블클릭으로 보고 무시함
      if (Date.now() - stepChangedAt.current < 700) {
        e.preventDefault();
        return;
      }
      for (let n = 1; n <= 3; n++) {
        const err = stepError(n);
        if (err) {
          e.preventDefault();
          setCreateError(err);
          setCreateStep(n);
          return;
        }
      }
    };

    const qTypeLabel: Record<QType, string> = {
      rating: "별점(1~5)",
      text: "서술형",
      dropdown: "드롭박스",
      checkbox: "체크박스",
      image: "이미지 업로드",
    };

    return (
      <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
        {/* 달력의 날짜에서 들어오면 달력으로, 그 외에는 평가 만들기로 돌아감 */}
        <button
          onClick={paramDate ? closeByBack : () => go("/dashboard/services")}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6"
        >
          &larr; {paramDate ? "뒤로" : "평가 만들기"}
        </button>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-6">평가 직접 만들기</h1>

        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = createStep > n;
            const current = createStep === n;
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                      current
                        ? "bg-[var(--accent)] text-white"
                        : done
                        ? "bg-[var(--accent-light)] text-[var(--accent)]"
                        : "bg-[var(--gray-100)] text-[var(--gray-500)]"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      current ? "text-[var(--foreground)]" : "text-[var(--gray-500)]"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {n < STEPS.length && (
                  <div
                    className={`flex-1 h-px mx-3 ${
                      done ? "bg-[var(--accent)]" : "bg-[var(--gray-200)]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <form action={createProjectAction} onSubmit={guardSubmit} className="space-y-4">
          <div className={createStep === 1 ? "space-y-4" : "hidden"}>
            <div>
              <label htmlFor="create-title" className={labelCls}>평가 제목</label>
              <input
                id="create-title"
                name="title"
                value={createForm.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="예) 학습 도우미 챗봇 사용성 평가"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="create-description" className={labelCls}>설명 (선택)</label>
              <textarea
                id="create-description"
                name="description"
                value={createForm.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="평가에 대한 설명을 입력하세요"
                className={`${field} h-20 resize-none`}
              />
            </div>
            <div>
              <label htmlFor="create-link" className={labelCls}>URL (선택)</label>
              <input
                id="create-link"
                name="link"
                type="url"
                inputMode="url"
                value={createForm.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="https://..."
                className={field}
              />
            </div>
            <div>
              <label htmlFor="create-location" className={labelCls}>평가 장소</label>
              <input
                id="create-location"
                name="location"
                value={createForm.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="장소를 입력하세요"
                className={field}
              />
            </div>
            <FundingFields value={funding} onChange={setFunding} orders={linkableOrders} />
          </div>

          <div className={createStep === 2 ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="create-date" className={labelCls}>날짜</label>
                <input
                  id="create-date"
                  name="date"
                  type="date"
                  value={createForm.date}
                  onChange={(e) => set("date", e.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="create-time" className={labelCls}>시간</label>
                <input
                  id="create-time"
                  name="time"
                  type="time"
                  value={createForm.time}
                  onChange={(e) => set("time", e.target.value)}
                  className={field}
                />
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
                  <label htmlFor="create-min" className={labelCls}>최소 인원</label>
                  <input
                    id="create-min"
                    name="minParticipants"
                    type="number"
                    min={1}
                    value={createForm.minParticipants}
                    onChange={(e) => set("minParticipants", e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="create-max" className={labelCls}>정원 (최대 인원)</label>
                  <input
                    id="create-max"
                    name="maxParticipants"
                    type="number"
                    min={1}
                    value={createForm.maxParticipants}
                    onChange={(e) => set("maxParticipants", e.target.value)}
                    className={field}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-enroll-date" className={labelCls}>신청 마감일 (선택)</label>
                  <input
                    id="create-enroll-date"
                    name="enrollmentDeadlineDate"
                    type="date"
                    value={createForm.enrollmentDeadlineDate}
                    onChange={(e) => set("enrollmentDeadlineDate", e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="create-enroll-time" className={labelCls}>신청 마감 시간</label>
                  <input
                    id="create-enroll-time"
                    name="enrollmentDeadlineTime"
                    type="time"
                    value={createForm.enrollmentDeadlineTime}
                    onChange={(e) => set("enrollmentDeadlineTime", e.target.value)}
                    className={field}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={createStep === 3 ? "" : "hidden"}>
            {renderQuestionBuilder(draftQs, setDraftQs, false)}
          </div>

          {createStep === 4 && (
            <div className="space-y-4">
              <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)]">
                {[
                  ["제목", createForm.title],
                  ["설명", createForm.description || "—"],
                  ["URL", createForm.link || "—"],
                  ["장소", createForm.location || "미정"],
                  ["일시", `${createForm.date} ${createForm.time}`],
                  [
                    "인원",
                    `최소 ${createForm.minParticipants}명 · 정원 ${createForm.maxParticipants}명`,
                  ],
                  [
                    "신청 마감",
                    createForm.enrollmentDeadlineDate
                      ? `${createForm.enrollmentDeadlineDate} ${createForm.enrollmentDeadlineTime}`
                      : "제한 없음",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4 px-4 py-2.5">
                    <span className="text-xs text-[var(--muted)] w-20 shrink-0 pt-0.5">{k}</span>
                    <span className="text-sm text-[var(--foreground)] break-all">{v}</span>
                  </div>
                ))}
              </div>

              <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-4">
                <p className="text-xs font-semibold text-[var(--gray-600)] mb-2">
                  평가문항 {draftQs.length}개
                </p>
                <ol className="space-y-1.5">
                  {draftQs.map((q, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-xs font-mono text-[var(--muted)] pt-0.5">Q{i + 1}</span>
                      <span className="text-[var(--foreground)] flex-1">{q.label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)] h-fit shrink-0">
                        {qTypeLabel[q.type]}
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

          {createError && (
            <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-[var(--radius-md)] px-3 py-2">
              {createError}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {createStep > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="px-5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] font-medium text-sm hover:bg-[var(--surface)] transition-colors"
              >
                이전
              </button>
            )}
            {createStep < 4 ? (
              <button
                key="next"
                type="button"
                onClick={goNext}
                className="flex-1 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] transition-all"
              >
                다음
              </button>
            ) : (
              <SubmitButton
                key="submit"
                pendingText="요청 중…"
                className="flex-1 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
              >
                승인 요청하기
              </SubmitButton>
            )}
          </div>
        </form>
      </div>
    );
  }

  if (view === "edit" && selected) {
    const st = new Date(selected.startTime);
    const editDate = `${st.getFullYear()}-${pad2(st.getMonth() + 1)}-${pad2(
      st.getDate()
    )}`;
    const editTime = `${pad2(st.getHours())}:${pad2(st.getMinutes())}`;
    const field =
      "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";
    const labelCls = "block text-xs font-medium text-[var(--gray-700)] mb-1.5";

    // 문항 잠금(updateProjectAction 과 같은 조건): 응답이 있거나 자동 구성 문항(itemKey)이 있으면
    // 편집기를 잠금
    const qs = selected.questions;
    const approvedLock =
      user.role !== "ADMIN" && selected.status !== "PENDING_APPROVAL" && selected.status !== "REJECTED";
    const locked = approvedLock || (selected.responseCount ?? 0) > 0 || qs.some((q) => !!q?.itemKey);

    return (
      <div className="bg-white rounded-[var(--radius-xl)] px-5 sm:px-8 py-6 sm:py-8">
        <button
          onClick={closeByBack}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6"
        >
          &larr; 뒤로
        </button>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-6">평가 수정</h1>

        <form action={updateProjectAction} className="space-y-4">
          <input type="hidden" name="projectId" value={selected.id} />
          {!locked && <input type="hidden" name="editQuestions" value="1" />}

          <div>
            <label htmlFor="edit-title" className={labelCls}>평가 제목</label>
            <input id="edit-title" name="title" defaultValue={selected.title} required className={field} />
          </div>

          <div>
            <label htmlFor="edit-description" className={labelCls}>설명 (선택)</label>
            <textarea
              id="edit-description"
              name="description"
              defaultValue={selected.description || ""}
              placeholder="평가자에게 보일 설명"
              className={`${field} h-20 resize-y`}
            />
          </div>

          <div>
            <label htmlFor="edit-link" className={labelCls}>평가할 서비스 주소 (선택)</label>
            <input
              id="edit-link"
              name="link"
              defaultValue={selected.link || ""}
              placeholder="https://..."
              type="url"
              inputMode="url"
              readOnly={approvedLock}
              className={`${field}${approvedLock ? " bg-[var(--gray-50)] text-[var(--muted)]" : ""}`}
            />
            {approvedLock && (
              <p className="mt-1 text-xs text-[var(--muted)]">승인된 평가의 서비스 주소는 관리자에게 변경을 요청해 주세요.</p>
            )}
          </div>

          <div>
            <label htmlFor="edit-location" className={labelCls}>평가 장소</label>
            <input id="edit-location" name="location" defaultValue={selected.location ?? ""} placeholder="미정이면 비워 두세요" className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-date" className={labelCls}>날짜</label>
              <input id="edit-date" name="date" type="date" required defaultValue={editDate} className={field} />
            </div>
            <div>
              <label htmlFor="edit-time" className={labelCls}>시간</label>
              <input id="edit-time" name="time" type="time" required defaultValue={editTime} className={field} />
            </div>
          </div>

          {locked ? (
            <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">평가문항</h3>
                <span className="text-xs text-[var(--muted)]">{qs.length}개 · 수정 불가</span>
              </div>
              <p className="text-sm text-[var(--gray-700)] bg-[var(--warning-light)] px-3 py-2 rounded-[var(--radius-md)] mb-3 leading-relaxed">
                {(selected.responseCount ?? 0) > 0
                  ? `이미 응답이 ${selected.responseCount}건 있어 문항을 바꿀 수 없습니다. 바꾸면 기존 응답이 다른 문항에 연결됩니다.`
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
            renderQuestionBuilder(editDraftQs, setEditDraftQs)
          )}

          <SubmitButton
            pendingText="저장 중…"
            className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm hover:bg-[var(--accent-dark)] transition-colors"
          >
            저장
          </SubmitButton>
        </form>
      </div>
    );
  }

  // LIST (Calendar + detail modal)
  const canCreate = user.role !== "USER";
  const sameDay = (iso: string, y: number, m: number, d: number) => {
    const t = new Date(iso);
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
  };
  // 이번 달 평가(날짜순). 폰에서는 달력 칸이 좁아 이 목록을 보여줌
  const monthEvents = (projects || [])
    .filter((p) => {
      const t = new Date(p.startTime);
      return t.getFullYear() === year && t.getMonth() === month;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const now = new Date();
  const navBtn =
    "w-9 h-9 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors";

  return (
    <div className="space-y-6">
      {/* 만든 평가는 관리자 승인 후 공개된다는 안내 */}
      {submitted && (
        <div role="status" className="rounded-[var(--radius-md)] bg-[var(--warning-light)] text-[var(--gray-800)] text-sm px-4 py-3">
          <strong>승인 요청이 접수되었습니다.</strong> 관리자가 내용을 확인한 뒤 평가자
          모집이 시작됩니다. 승인·반려 결과는 알림으로 알려드립니다.
        </div>
      )}
      {answered && (
        <div role="status" className="rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)] text-sm px-4 py-3">
          <strong>{answered === "updated" ? "고친 응답을 저장했습니다." : "응답을 제출했습니다. 참여해 주셔서 감사합니다."}</strong>
          {answered !== "updated" && " 보상이 있는 평가는 검수 후 지급됩니다."}
        </div>
      )}
      {invalid && (
        <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] text-sm px-4 py-3">
          <strong>응답을 저장하지 못했어요.</strong> 빠진 문항이나 올바르지 않은 값이 있어요. 평가를 다시 열어
          확인한 뒤 제출해 주세요. 작성하던 내용은 이 기기에 남아 있어요.
        </div>
      )}
      {full && (
        <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--danger-light)] text-[var(--danger)] text-sm px-4 py-3">
          <strong>모집 정원이 찼습니다.</strong> 응답이 저장되지 않았습니다. 다른 평가를
          찾아봐 주세요.
        </div>
      )}

      <section aria-labelledby="cal-h" className="bg-white rounded-[var(--radius-xl)] p-5">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <h2 id="cal-h" className="text-[17px] font-bold text-[var(--foreground)] tabular-nums mr-1">
              {month + 1}월 일정
            </h2>
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className={navBtn} aria-label="이전 달">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className={navBtn} aria-label="다음 달">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            {(year !== now.getFullYear() || month !== now.getMonth()) && (
              <button onClick={() => setViewDate(new Date())} className="text-sm text-[var(--gray-700)] underline px-1">
                오늘
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 목록/달력 전환(폰에서는 목록만) */}
            <div role="group" aria-label="일정 보기 방식" className="hidden sm:flex p-0.5 rounded-[var(--radius-md)] bg-[var(--gray-100)]">
              {(["list", "calendar"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickCalMode(m)}
                  aria-pressed={calMode === m}
                  className={`px-3 py-1.5 text-sm rounded-[10px] transition-colors ${
                    calMode === m ? "bg-white text-[var(--foreground)] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--gray-600)]"
                  }`}
                >
                  {m === "list" ? "목록" : "달력"}
                </button>
              ))}
            </div>
            {canCreate && (
              <Link
                href="/dashboard/services"
                className="px-3.5 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-semibold hover:bg-[var(--accent-dark)] transition-colors"
              >
                평가 만들기
              </Link>
            )}
          </div>
        </div>

        {/* 범례(달력 보기). 색만으로 구분하지 않도록 글자로도 적음 */}
        <div className={`${calMode === "calendar" ? "hidden sm:flex" : "hidden"} flex-wrap gap-2 mb-3 text-xs`}>
          {["RECRUITING", "ACTIVE", "FINISHED", ...(canCreate ? ["PENDING_APPROVAL"] : [])].map((st) => (
            <span key={st} className={`px-1.5 py-0.5 rounded ${statusMeta(st).cls}`}>
              {statusMeta(st).label}
            </span>
          ))}
        </div>

        {/* 목록 보기(폰에서는 항상) */}
        <ul className={`${calMode === "calendar" ? "sm:hidden" : ""} divide-y divide-[var(--gray-100)]`}>
          {monthEvents.length === 0 && <li className="py-6 text-sm text-center text-[var(--muted)]">이번 달 평가가 없습니다</li>}
          {monthEvents.map((e) => {
            const t = new Date(e.startTime);
            const meta = statusMeta(e.status);
            return (
              <li key={e.id}>
                <button onClick={() => openDetail(e)} className="w-full flex items-center gap-3 py-3 -mx-2 px-2 rounded-[var(--radius-md)] text-left hover:bg-[var(--gray-50)]">
                  <span className="w-11 shrink-0 text-center">
                    <span className="block text-lg font-bold text-[var(--foreground)] leading-none">{t.getDate()}</span>
                    <span className="block text-xs text-[var(--muted)] mt-0.5">{["일", "월", "화", "수", "목", "금", "토"][t.getDay()]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-[var(--foreground)] truncate">{e.title}</span>
                    <span className="block text-[13px] text-[var(--muted)] truncate">
                      {t.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })} · {e.location}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* 달력 보기(태블릿·데스크톱) */}
        <div className={`${calMode === "calendar" ? "hidden sm:grid" : "hidden"} grid-cols-7 gap-px bg-[var(--gray-100)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--gray-100)]`}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div
              key={d}
              className={`text-xs font-medium text-center py-2 bg-[var(--surface)] ${
                i === 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"
              }`}
            >
              {d}
            </div>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-white"></div>
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            // 같은 날 평가가 여럿이면 각각 눌러 열 수 있게 함
            const evs = (projects || []).filter((p) => sameDay(p.startTime, year, month, day));
            const dateYYYYMMDD = `${year}-${pad2(month + 1)}-${pad2(day)}`;
            const isToday = sameDay(now.toISOString(), year, month, day);

            return (
              <div key={day} className="group min-h-[88px] bg-white p-1.5 flex flex-col">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? "bg-[var(--accent)] text-white font-semibold" : "text-[var(--gray-700)]"
                    }`}
                  >
                    {day}
                  </span>
                  {canCreate && (
                    <button
                      onClick={() => createOn(dateYYYYMMDD)}
                      aria-label={`${month + 1}월 ${day}일에 평가 만들기`}
                      className="w-6 h-6 rounded text-[var(--gray-500)] hover:bg-[var(--gray-100)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-1">
                  {evs.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openDetail(e)}
                      title={`${e.title} · ${statusMeta(e.status).label}`}
                      className={`block w-full text-left text-xs leading-snug px-1.5 py-1 rounded truncate hover:opacity-80 ${statusMeta(e.status).cls}`}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 상세 모달: 폰에서는 하단 시트, 넓은 화면에서는 가운데 창 */}
      {view === "detail" && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-title"
        >
          <div className="absolute inset-0 bg-black/40" onClick={closeByBack} />

          <div className="relative w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-white rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--gray-200)] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {selected ? (
                  <>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded inline-block mb-2 ${statusMeta(selected.status).cls}`}>
                      {statusMeta(selected.status).label}
                    </span>
                    <h2 id="detail-title" className="text-lg font-bold text-[var(--foreground)] break-keep">
                      {selected.title}
                    </h2>
                  </>
                ) : (
                  <h2 id="detail-title" className="text-lg font-bold text-[var(--foreground)]">
                    평가를 찾을 수 없습니다
                  </h2>
                )}
              </div>
              <button
                type="button"
                onClick={closeByBack}
                className="w-9 h-9 shrink-0 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors"
                aria-label="닫기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {!selected ? (
              <p className="text-sm text-[var(--muted)] mt-3">
                삭제되었거나 볼 권한이 없는 평가입니다.
              </p>
            ) : (
              (() => {
                const enrollments = selected.enrollments || [];
                const myEnrollment = enrollments.find((e) => e.userId === user.id);
                const isEnrolled = !!myEnrollment;
                // 정원 초과 신청을 허용하므로 신청 버튼을 정원으로 막지 않음
                // 응답 권한은 선발(ACCEPTED) 여부로 결정됨
                const isAccepted = myEnrollment?.status === "ACCEPTED";
                const isRejected = myEnrollment?.status === "REJECTED";
                // 관리자가 진행 중에 제외한 사람(removeParticipantAction)
                const isRemoved = myEnrollment?.status === "REMOVED";
                // 평가가 시작된 뒤 선발된 사람은 취소할 수 없음(cancelEnrollmentAction 과 같은 조건).
                const isRecruiting = selected.status === "RECRUITING";
                const isActive = selected.status === "ACTIVE";
                const isOpen = isRecruiting || isActive;
                const canCancel = isRecruiting || (!isAccepted && !isRemoved && isActive);
                // 학생에게는 명단 대신 인원 수만 내려옴(page.tsx).
                const enrollmentCount: number = selected.enrollmentCount ?? enrollments.length;
                const acceptedCount: number =
                  selected.acceptedCount ?? enrollments.filter((e) => e.status === "ACCEPTED").length;
                const deadlinePassed = selected.enrollmentDeadline
                  ? new Date() > new Date(selected.enrollmentDeadline)
                  : false;
                const isCreatorOrAdmin = user.role === "ADMIN" || user.id === selected.creatorId;
                const myResponse = (selected.responses || []).find((r) => r.userId === user.id);
                const capacity = selected.capacity ?? selected.maxParticipants ?? 10;
                const primaryBtn =
                  "w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-dark)] transition-colors";
                const secondaryBtn =
                  "flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--gray-50)] transition-colors";
                const st = new Date(selected.startTime);

                return (
                  <div className="mt-4 space-y-4">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-[var(--muted)]">일시</dt>
                      <dd className="text-[var(--foreground)]">
                        {st.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" })}{" "}
                        {st.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })}
                      </dd>
                      <dt className="text-[var(--muted)]">장소</dt>
                      <dd className="text-[var(--foreground)]">{selected.location || "미정"}</dd>
                      {/* 보상액은 플랫폼이 지급하는 건에만 표시함(page.tsx 가 계산) */}
                      {selected.rewardPerPerson > 0 && (
                        <>
                          <dt className="text-[var(--muted)]">보상</dt>
                          <dd className="text-[var(--foreground)] font-medium">
                            1인 {Number(selected.rewardPerPerson).toLocaleString("ko-KR")}원 <span className="text-xs text-[var(--muted)] font-normal">(세전, 검수 후 지급)</span>
                          </dd>
                        </>
                      )}
                      {selected.enrollmentDeadline && (
                        <>
                          <dt className="text-[var(--muted)]">신청 마감</dt>
                          <dd className={deadlinePassed ? "text-[var(--danger)]" : "text-[var(--foreground)]"}>
                            {new Date(selected.enrollmentDeadline).toLocaleString("ko-KR", {
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Seoul",
                            })}
                            {deadlinePassed && " (마감됨)"}
                          </dd>
                        </>
                      )}
                    </dl>
                    <CreatorBadge project={selected} />
                    {selected.description && (
                      <p className="text-sm text-[var(--gray-700)] whitespace-pre-line leading-relaxed">{selected.description}</p>
                    )}

                    {selected.status === "PENDING_APPROVAL" && (
                      <p className="text-sm text-[var(--gray-800)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
                        관리자 승인을 기다리는 중입니다. 승인되면 평가자 모집이 시작되고 알림이 갑니다.
                        아직 학생에게는 보이지 않습니다.
                      </p>
                    )}
                    {selected.status === "REJECTED" && (
                      <p className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
                        <strong>반려되었습니다.</strong>
                        {selected.rejectReason ? ` 사유: ${selected.rejectReason}` : ""} 내용을 고쳐 새로 요청해 주세요.
                      </p>
                    )}

                    {isOpen && (
                      <div className="p-3 bg-[var(--surface)] rounded-[var(--radius-md)]">
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-[var(--gray-700)]">선발 정원 {capacity}명</span>
                          <span className="text-[var(--foreground)] font-medium tabular-nums">
                            {isRecruiting ? `신청 ${enrollmentCount}명` : `참여 ${acceptedCount}명`}
                          </span>
                        </div>
                        <div className="w-full bg-[var(--gray-200)] rounded-full h-1.5" aria-hidden="true">
                          <div
                            className="bg-[var(--accent)] h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, ((isRecruiting ? enrollmentCount : acceptedCount) / Math.max(1, capacity)) * 100)}%`,
                            }}
                          />
                        </div>
                        {isRecruiting && (
                          <p className="text-xs text-[var(--muted)] mt-2">
                            정원을 넘어도 신청할 수 있고, 개설자가 신청자 중에서 선발합니다.
                          </p>
                        )}
                      </div>
                    )}

                    {enrollClosed && !isEnrolled && (
                      <p role="alert" className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
                        신청하는 사이 모집이 마감되어 신청되지 않았어요.
                      </p>
                    )}

                    <div className="space-y-2">
                      {isCreatorOrAdmin && isRecruiting && (
                        <button type="button" onClick={() => go(`/dashboard?view=recruit&p=${selected.id}`)} className={primaryBtn}>
                          신청자 선발 ({enrollments.length}명 신청{acceptedCount > 0 ? ` · ${acceptedCount}명 선발됨` : ""})
                        </button>
                      )}
                      {isCreatorOrAdmin && isActive && (
                        <button type="button" onClick={() => go(`/dashboard?view=recruit&p=${selected.id}`)} className={`${secondaryBtn} w-full`}>
                          평가자 관리 ({acceptedCount}명 참여 중)
                        </button>
                      )}

                      {isAccepted && isActive && (
                        <button type="button" onClick={() => go(`/dashboard?view=eval&p=${selected.id}`)} className={primaryBtn}>
                          {myResponse ? "내 응답 보기·고치기" : "평가 응답하기"}
                        </button>
                      )}
                      {isRecruiting && isEnrolled && (
                        <p className="text-sm text-center text-[var(--gray-700)] bg-[var(--accent-light)] rounded-[var(--radius-md)] py-2.5">
                          신청이 접수되었습니다. 선발 결과는 알림으로 알려드립니다.
                        </p>
                      )}
                      {isActive && isEnrolled && !isAccepted && (
                        <p className="text-sm text-center text-[var(--gray-700)] py-2">
                          {isRemoved
                            ? "관리자에 의해 이 평가 참여에서 제외되었습니다. 문의는 관리자에게 해 주세요."
                            : isRejected
                              ? "이번 평가에는 선발되지 않았습니다."
                              : "선발되지 않아 응답할 수 없습니다."}
                        </p>
                      )}
                      {isActive && isAccepted && (
                        <p className="text-xs text-center text-[var(--muted)]">
                          참여를 그만두어야 하면 관리자에게 연락해 주세요. 진행 중인 평가는 스스로 취소할 수 없습니다.
                        </p>
                      )}
                      {!isEnrolled && !isCreatorOrAdmin && isRecruiting && (
                        // 신청하면 개설자에게 알림이 가므로 확인을 받음
                        <form
                          action={enrollProjectAction}
                          onSubmit={(e) =>
                            confirmSubmit(e, {
                              message:
                                `"${selected.title}"에 참여 신청합니다.\n\n` +
                                "· 개설자에게 신청 알림이 갑니다.\n" +
                                "· 선발되면 알림으로 알려드립니다. 모집 중에는 스스로 취소할 수 있습니다.\n\n" +
                                "정말 신청하시겠습니까?",
                              confirmLabel: "참여 신청",
                            })
                          }
                        >
                          <input type="hidden" name="projectId" value={selected.id} />
                          <SubmitButton disabled={deadlinePassed} pendingText="신청 중…" className={primaryBtn}>
                            {deadlinePassed ? "신청 기한이 지났습니다" : "참여 신청"}
                          </SubmitButton>
                        </form>
                      )}
                      {!isEnrolled && !isCreatorOrAdmin && isActive && (
                        <p className="text-sm text-center text-[var(--muted)] py-2">모집이 끝난 평가입니다.</p>
                      )}
                      {/* 취소하면 신청이 삭제되고, 평가가 시작되면 다시 신청할 수 없으므로 확인을 받음 */}
                      {isEnrolled && canCancel && (
                        <form
                          action={cancelEnrollmentAction}
                          onSubmit={(e) =>
                            confirmSubmit(e, {
                              message: isRecruiting
                                ? `"${selected.title}" 참여 신청을 취소합니다.\n\n` +
                                  (isAccepted ? "· 선발 후보에서도 빠집니다.\n" : "") +
                                  (deadlinePassed
                                    ? "· 신청 기한이 지나 다시 신청할 수 없습니다.\n"
                                    : "· 신청 기한 안에는 다시 신청할 수 있습니다.\n") +
                                  "· 평가가 시작된 뒤에는 선발된 사람이 스스로 취소할 수 없습니다.\n\n정말 취소하시겠습니까?"
                                : `"${selected.title}" 신청 기록을 지웁니다. 이 평가는 이미 시작되어 다시 신청할 수 없습니다.\n\n정말 지우시겠습니까?`,
                              confirmLabel: "신청 취소",
                              danger: deadlinePassed || !isRecruiting,
                            })
                          }
                        >
                          <input type="hidden" name="projectId" value={selected.id} />
                          <SubmitButton pendingText="취소 중…" className="w-full py-2 text-sm text-[var(--gray-700)] underline hover:text-[var(--danger)]">
                            신청 취소
                          </SubmitButton>
                        </form>
                      )}
                    </div>

                    {isCreatorOrAdmin && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => go(`/dashboard?view=result&p=${selected.id}`)} className={secondaryBtn}>
                          결과 보기 ({selected.responseCount ?? 0})
                        </button>
                        {canExport(selected) && (
                          <a href={`/api/export?projectId=${selected.id}`} className={secondaryBtn}>
                            엑셀 내보내기
                          </a>
                        )}
                      </div>
                    )}

                    {/* 개설자에게 문의(참여자) */}
                    {selected.creatorId && selected.creatorId !== user.id && (
                      <details className="rounded-[var(--radius-md)] border border-[var(--gray-200)]">
                        <summary className="px-3 py-2.5 text-sm text-[var(--gray-700)] cursor-pointer">
                          개설자({selected.creatorName})에게 문의하기
                        </summary>
                        <form
                          action={async (fd: FormData) => {
                            fd.set("receiverId", selected.creatorId!);
                            await sendMessageAction(fd);
                            toast("메시지를 보냈습니다. 답장은 메신저에서 볼 수 있습니다.", "success");
                          }}
                          className="flex gap-2 px-3 pb-3"
                        >
                          <input
                            name="content"
                            placeholder="메시지를 입력하세요"
                            aria-label="개설자에게 보낼 메시지"
                            required
                            className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                          />
                          <SubmitButton pendingText="…" className="px-3.5 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] shrink-0">
                            보내기
                          </SubmitButton>
                        </form>
                      </details>
                    )}

                    {/* 관리(개설자·관리자): 되돌리기 어려운 조작 */}
                    {canEdit(selected) && (
                      <details className="rounded-[var(--radius-md)] border border-[var(--gray-200)]">
                        <summary className="px-3 py-2.5 text-sm font-medium text-[var(--gray-700)] cursor-pointer">
                          관리: 공지·수정·종료{user.role === "ADMIN" ? "·삭제" : ""}
                        </summary>
                        <div className="px-3 pb-3 space-y-3">
                          {enrollments.length > 0 && (
                            <form
                              action={async (fd: FormData) => {
                                await sendProjectAnnouncementAction(fd);
                                toast("공지를 보냈습니다.", "success");
                              }}
                              onSubmit={(e) => {
                                const recipients = enrollments.filter((x) => x.status !== "REMOVED").length;
                                confirmSubmit(e, {
                                  message: `평가자 ${recipients}명에게 알림을 보냅니다. 보낸 알림은 취소할 수 없습니다.\n\n정말 보내시겠습니까?`,
                                  confirmLabel: "공지 보내기",
                                });
                              }}
                              className="space-y-1.5"
                            >
                              <input type="hidden" name="projectId" value={selected.id} />
                              <label htmlFor="announce" className="block text-xs font-medium text-[var(--gray-700)]">
                                신청자 전체에게 공지 ({enrollments.length}명)
                              </label>
                              <div className="flex gap-2">
                                <input
                                  id="announce"
                                  name="content"
                                  placeholder="예) 장소가 공학관 1316호로 바뀌었습니다"
                                  required
                                  className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                                />
                                <SubmitButton pendingText="…" className="px-3.5 py-2 border border-[var(--gray-300)] text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] shrink-0">
                                  보내기
                                </SubmitButton>
                              </div>
                            </form>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {selected.status !== "FINISHED" && (
                              <button type="button" onClick={() => go(`/dashboard?view=edit&p=${selected.id}`)} className={secondaryBtn}>
                                수정
                              </button>
                            )}
                            {isOpen && (
                              <form
                                action={finishProjectAction}
                                className="flex-1 flex"
                                onSubmit={(e) =>
                                  // 종료는 되돌릴 수 없음
                                  confirmSubmit(e, {
                                    message:
                                      `"${selected.title}" 평가를 종료합니다.\n\n` +
                                      `· 더 이상 응답을 받지 않습니다(현재 응답 ${selected.responseCount ?? 0}건).\n` +
                                      `· 응답한 평가자 전원에게 종료 알림이 나갑니다.\n` +
                                      `· 종료한 평가는 화면에서 다시 열 수 없습니다.\n\n정말 종료하시겠습니까?`,
                                    confirmLabel: "평가 종료",
                                    danger: true,
                                  })
                                }
                              >
                                <input type="hidden" name="projectId" value={selected.id} />
                                <SubmitButton pendingText="종료 중…" className={secondaryBtn}>
                                  평가 종료
                                </SubmitButton>
                              </form>
                            )}
                            {user.role === "ADMIN" && (
                              <form
                                action={deleteProjectAction}
                                className="flex-1 flex"
                                onSubmit={(e) =>
                                  confirmSubmit(e, {
                                    message:
                                      `"${selected.title}" 평가를 영구 삭제합니다.\n\n` +
                                      `· 응답 ${selected.responseCount ?? 0}건과 신청 기록이 함께 지워집니다.\n` +
                                      `· 되돌릴 수 없습니다.\n\n정말 삭제하시겠습니까?`,
                                    confirmLabel: "영구 삭제",
                                    danger: true,
                                  })
                                }
                              >
                                <input type="hidden" name="projectId" value={selected.id} />
                                <SubmitButton
                                  pendingText="삭제 중…"
                                  className="flex-1 px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--danger)] text-[var(--danger)] text-sm font-medium hover:bg-[var(--danger-light)] transition-colors"
                                >
                                  삭제
                                </SubmitButton>
                              </form>
                            )}
                          </div>
                        </div>
                      </details>
                    )}

                    {/* 신청자 명단(개설자·관리자) */}
                    {isCreatorOrAdmin && enrollments.length > 0 && (
                      <details className="rounded-[var(--radius-md)] border border-[var(--gray-200)]">
                        <summary className="px-3 py-2.5 text-sm text-[var(--gray-700)] cursor-pointer">
                          신청자 {enrollments.length}명
                        </summary>
                        <ul className="px-3 pb-3 space-y-1">
                          {enrollments.map((e) => (
                            <li key={e.id} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--foreground)]">
                                {e.userName} <span className="text-[var(--muted)]">({e.userStudentId})</span>
                              </span>
                              <span className="text-xs text-[var(--muted)]">
                                {new Date(e.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="border-t border-[var(--gray-100)] pt-4">
                      <p className="text-xs font-medium text-[var(--muted)] mb-2">
                        평가문항 {(questions || []).length}개
                      </p>
                      <ol className="space-y-1.5">
                        {(questions || []).slice(0, 5).map((q, i) => (
                          <li key={i} className="bg-[var(--surface)] rounded-[var(--radius-md)] px-3.5 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--foreground)] truncate">
                              {q.type === "semantic7" ? `${q.leftLabel} ↔ ${q.rightLabel}` : q.label}
                            </span>
                            <span className="text-xs text-[var(--muted)] shrink-0">{QTYPE_LABEL[q.type] ?? ""}</span>
                          </li>
                        ))}
                      </ol>
                      {(questions || []).length > 5 && (
                        <p className="text-xs text-[var(--muted)] pl-1 mt-1.5">외 {(questions || []).length - 5}개</p>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}
