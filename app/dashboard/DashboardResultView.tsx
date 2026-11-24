"use client";

import { ui } from "../components/ui";
import { commentKey, questionKey } from "../lib/projectQuestions";
import {
  canManageProject,
  QTYPE_LABEL,
  type DashboardProject,
  type DashboardUser,
} from "./dashboardTypes";

export default function DashboardResultView({
  project,
  user,
  onBack,
}: {
  project: DashboardProject;
  user: DashboardUser;
  onBack: () => void;
}) {
  if (!canManageProject(user, project)) {
    return (
      <div className="bg-white rounded-[var(--radius-xl)] p-8 text-center">
        <p className="text-[var(--danger)] font-medium mb-4">결과를 볼 권한이 없습니다.</p>
        <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          &larr; 뒤로
        </button>
      </div>
    );
  }

  const questions = Array.isArray(project.questions) ? project.questions : [];
  const res = project.responses || [];

  return (
    <div className="bg-white rounded-[var(--radius-xl)] p-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          &larr; 뒤로
        </button>

        <a href={`/api/export?projectId=${project.id}`} className={`${ui.primarySm} gap-1.5`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          내보내기
        </a>
      </div>

      <h1 className="text-xl font-bold text-[var(--foreground)] mb-1">{project.title}</h1>
      <p className="text-sm text-[var(--muted)] mb-8">결과 · 응답 {project.responseCount ?? 0}건</p>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const key = questionKey(q, i);
          const scores = res.map((r) => Number(r.answers?.[key])).filter((s) => !isNaN(s));
          const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";

          const isScale = q.type === "rating" || q.type === "likert5" || q.type === "semantic7" || q.type === "scale";
          const scaleMin = q.type === "scale" ? (q.scaleMin ?? 1) : 1;
          const scaleMax = q.type === "scale" ? (q.scaleMax ?? 7) : q.type === "semantic7" ? 7 : 5;

          const dist: number[] = [];
          if (isScale) {
            for (let v = scaleMin; v <= scaleMax; v++) {
              dist.push(scores.filter((s) => Math.round(s) === v).length);
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
              for (const x of arr) counts[String(x)] = (counts[String(x)] || 0) + 1;
            }
          }

          return (
            <div key={i} className="p-5 bg-[var(--surface)] rounded-[var(--radius-lg)]">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                <span className="text-[var(--muted)] font-normal mr-1.5">{i + 1}.</span>
                {q.type === "semantic7" ? `${q.leftLabel} ↔ ${q.rightLabel}` : q.label}
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">{QTYPE_LABEL[q.type] ?? ""}</span>
              </h3>

              {isScale ? (
                <div className="space-y-2">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-[var(--accent)]">{avg}</span>
                    <span className="text-sm text-[var(--gray-500)]">/ {scaleMax}.0</span>
                    <span className="text-xs text-[var(--gray-500)] ml-2">응답 {scores.length}명</span>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {dist.map((n, v) => {
                      const ratio = scores.length > 0 ? n / scores.length : 0;
                      return (
                        <div key={v} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t-sm bg-[var(--accent)]"
                            style={{
                              height: `${Math.max(2, Math.round(ratio * 36))}px`,
                              opacity: n > 0 ? 1 : 0.15,
                            }}
                          />
                          <span className="text-xs text-[var(--gray-500)]">{v + scaleMin}</span>
                        </div>
                      );
                    })}
                  </div>

                  {comments.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {comments.map((c, idx) => (
                        <div key={idx} className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)]">
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
                  {(q.options || []).map((opt, idx) => (
                    <div key={idx} className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex justify-between items-center">
                      <span className="text-sm text-[var(--foreground)]">{opt}</span>
                      <span className="text-sm font-semibold text-[var(--accent)]">{counts[opt] || 0}</span>
                    </div>
                  ))}
                </div>
              ) : q.type === "image" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {res.map((r, idx) => {
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                        <p className="text-xs text-[var(--gray-500)] truncate">
                          {r.userName || "익명"} ({r.userStudentId || "-"})
                        </p>
                      </div>
                    );
                  })}
                  {res.filter((r) => {
                    const v = String(r.answers?.[key] ?? "").trim();
                    return v && (v.startsWith("/uploads/") || v.startsWith("/api/uploads/"));
                  }).length === 0 && (
                    <p className="text-sm text-[var(--gray-500)] col-span-full">제출된 이미지가 없습니다</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {res.map((r, idx) => (
                    <div key={idx} className="bg-white px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-200)]">
                      <p className="text-sm text-[var(--gray-600)]">{String(r.answers?.[key] ?? "")}</p>
                      <p className="text-xs text-[var(--gray-500)] mt-1">
                        {r.userName || "익명"} ({r.userStudentId || "-"})
                      </p>
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
