"use client";

import { useState } from "react";
import { ProjectGuidesList } from "../components/ProjectGuidesField";
import { toast } from "../components/feedback";
import EvalForm from "./EvalForm";
import EvalServiceLink from "./EvalServiceLink";
import { createDmRoom } from "./messenger/actions";
import type { DashboardProject, DashboardUser } from "./dashboardTypes";

export default function DashboardEvalView({
  project,
  user,
  onBack,
}: {
  project: DashboardProject;
  user: DashboardUser;
  onBack: () => void;
}) {
  const [splitUrl, setSplitUrl] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(50);
  const [dragging, setDragging] = useState(false);

  const myEnrollment = (project.enrollments || []).find((e) => e.userId === user.id);
  if (project.status !== "ACTIVE" || myEnrollment?.status !== "ACCEPTED") {
    return (
      <div className="bg-white rounded-[var(--radius-xl)] p-8 text-center">
        <p className="text-sm text-[var(--gray-700)]">
          {project.status === "RECRUITING"
            ? "아직 모집 중인 평가입니다. 선발 결과를 기다려 주세요."
            : project.status === "FINISHED"
              ? "종료된 평가라 더 이상 응답할 수 없어요."
              : myEnrollment?.status === "REMOVED"
                ? "이 평가 참여에서 제외되어 응답할 수 없어요. 문의는 관리자에게 해 주세요."
                : myEnrollment
                  ? "이번 평가에는 선발되지 않아 응답할 수 없어요."
                  : "신청하고 선발된 평가만 응답할 수 있어요."}
        </p>
        <button onClick={onBack} className="mt-4 text-sm font-medium text-[var(--foreground)] underline">
          돌아가기
        </button>
      </div>
    );
  }

  const questions = Array.isArray(project.questions) ? project.questions : [];
  const myResponse = (project.responses || []).find((r) => r.userId === user.id);
  const prevAnswers = (myResponse?.answers ?? {}) as Record<string, unknown>;

  const toolbar = (
    <div className="flex items-center justify-between gap-2 mb-5">
      <button
        onClick={() => {
          setSplitUrl(null);
          onBack();
        }}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        &larr; 뒤로
      </button>

      {project.link && splitUrl && (
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

  const serviceIntro = (
    <>
      {project.link && (
        <EvalServiceLink
          projectId={project.id}
          link={project.link}
          split={!!splitUrl}
          onSplit={() => setSplitUrl(project.link)}
        />
      )}
      <ProjectGuidesList guides={project.guides} />
      <div className="flex flex-wrap gap-4 text-sm text-[var(--accent)]">
        {project.creatorId && project.creatorId !== user.id && (
          <button
            type="button"
            className="underline"
            onClick={async () => {
              try {
                const room = await createDmRoom(project.creatorId!);
                if (room) {
                  window.dispatchEvent(new CustomEvent("hub:open", { detail: { room, draft: `[${project.title}] ` } }));
                } else {
                  toast("개설자와 대화를 열 수 없어요.", "error");
                }
              } catch {
                toast("대화를 열지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
              }
            }}
          >
            개설자에게 문의하기
          </button>
        )}
      </div>
    </>
  );

  const form = (stickyTop: string) => (
    <EvalForm
      project={{ id: project.id, title: project.title, location: project.location ?? undefined }}
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
          const rect = e.currentTarget.getBoundingClientRect();
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
          className="w-1.5 bg-[var(--gray-100)] hover:bg-[var(--accent)] cursor-col-resize shrink-0 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
        />
        <div className="flex flex-col" style={{ width: `${100 - splitRatio}%` }}>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
              로그인이 안 되거나 화면이 비면 새 탭에서 열어 주세요
            </span>
            <a
              href={splitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--accent)]"
            >
              새 탭에서 열기
            </a>
          </div>
          <iframe
            src={splitUrl}
            className="w-full flex-1 border-0"
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
