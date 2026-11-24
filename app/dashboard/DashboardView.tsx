"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { statusMeta } from "@/app/lib/projectStatus";
import { ui } from "../components/ui";
import { useEscape } from "../components/useEscape";
import DashboardDetailModal from "./DashboardDetailModal";
import DashboardEvalView from "./DashboardEvalView";
import {
  CreateAutoProjectView,
  CreateManualProjectView,
  EditProjectView,
} from "./DashboardProjectForms";
import DashboardResultView from "./DashboardResultView";
import { clearEvalDraft } from "./EvalForm";
import type { LinkableOrder } from "./FundingFields";
import RecruitPanel from "./RecruitPanel";
import {
  canManageProject,
  pad2,
  type DashboardProject,
  type DashboardUser,
} from "./dashboardTypes";

export type { DashboardProject, DashboardUser };

const NAV_BTN =
  "w-9 h-9 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors";

function sameDay(iso: string, y: number, m: number, d: number) {
  const t = new Date(iso);
  return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
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
  const enrollClosed = sp.get("enroll") === "closed";
  const answerClosed = sp.get("answer") === "closed";
  const answered = sp.get("answered");
  const answeredProjectId = sp.get("done");
  const paramDate = sp.get("d") || "";
  const paramTime = sp.get("t") || "";
  const preselectServiceId = sp.get("s") || "";

  useEffect(() => {
    if (answered && answeredProjectId) clearEvalDraft(answeredProjectId, user.id);
  }, [answered, answeredProjectId, user.id]);

  const selected = useMemo(
    () => (selectedId ? (projects || []).find((p) => p.id === selectedId) || null : null),
    [projects, selectedId]
  );

  const [viewDate, setViewDate] = useState(new Date());
  const [calMode, setCalMode] = useState<"list" | "calendar">("list");

  useEffect(() => {
    try {
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

  const go = useCallback((url: string) => router.push(url, { scroll: false }), [router]);

  const closeByBack = useCallback(() => {
    const cameFromApp = document.referrer.startsWith(window.location.origin);
    if (window.history.length > 1 && cameFromApp) router.back();
    else router.push("/dashboard", { scroll: false });
  }, [router]);

  useEscape(view === "detail", closeByBack);
  useEffect(() => {
    if (view !== "detail") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [view]);

  if (view === "eval" && selected) {
    return <DashboardEvalView key={selected.id} project={selected} user={user} onBack={closeByBack} />;
  }

  if (view === "result" && selected) {
    return <DashboardResultView project={selected} user={user} onBack={closeByBack} />;
  }

  if (view === "recruit" && selected && canManageProject(user, selected)) {
    return <RecruitPanel project={selected} onBack={closeByBack} isAdmin={user.role === "ADMIN"} />;
  }

  if (view === "create-auto") {
    return (
      <CreateAutoProjectView
        confirmedServices={confirmedServices}
        linkableOrders={linkableOrders}
        preselectServiceId={preselectServiceId}
        paramDate={paramDate}
        frozen={sp.get("frozen") === "1"}
      />
    );
  }

  if (view === "create") {
    return (
      <CreateManualProjectView
        key={`${paramDate}:${paramTime}`}
        linkableOrders={linkableOrders}
        paramDate={paramDate}
        paramTime={paramTime}
      />
    );
  }

  if (view === "edit" && selected) {
    return <EditProjectView key={selected.id} project={selected} user={user} onBack={closeByBack} />;
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const canCreate = user.role !== "USER";
  const now = new Date();

  const monthEvents = (projects || [])
    .filter((p) => {
      const t = new Date(p.startTime);
      return t.getFullYear() === year && t.getMonth() === month;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const openDetail = (p: DashboardProject) => go(`/dashboard?view=detail&p=${p.id}`);
  const createOn = (dateYYYYMMDD: string) => go(`/dashboard/services?d=${encodeURIComponent(dateYYYYMMDD)}`);

  return (
    <div className="space-y-6">
      <section aria-labelledby="cal-h" className="bg-white rounded-[var(--radius-xl)] p-5">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <h2 id="cal-h" className="text-[17px] font-bold text-[var(--foreground)] tabular-nums mr-1">
              {month + 1}월 일정
            </h2>
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className={NAV_BTN} aria-label="이전 달">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className={NAV_BTN} aria-label="다음 달">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            {(year !== now.getFullYear() || month !== now.getMonth()) && (
              <button onClick={() => setViewDate(new Date())} className="text-sm text-[var(--gray-700)] underline px-1">
                오늘
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              <Link href="/dashboard/services" className={ui.primarySm}>
                평가 만들기
              </Link>
            )}
          </div>
        </div>

        <div className={`${calMode === "calendar" ? "hidden sm:flex" : "hidden"} flex-wrap gap-2 mb-3 text-xs`}>
          {["RECRUITING", "ACTIVE", "FINISHED", ...(canCreate ? ["PENDING_APPROVAL"] : [])].map((st) => (
            <span key={st} className={`px-1.5 py-0.5 rounded ${statusMeta(st).cls}`}>
              {statusMeta(st).label}
            </span>
          ))}
        </div>

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

        <div className={`${calMode === "calendar" ? "hidden sm:grid" : "hidden"} grid-cols-7 gap-px bg-[var(--gray-100)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--gray-100)]`}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={`text-xs font-medium text-center py-2 bg-[var(--surface)] ${i === 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
              {d}
            </div>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-white" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
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

      {view === "detail" && (
        <DashboardDetailModal
          selected={selected}
          user={user}
          enrollClosed={enrollClosed}
          answerClosed={answerClosed}
          onClose={closeByBack}
          onNavigate={go}
        />
      )}
    </div>
  );
}
