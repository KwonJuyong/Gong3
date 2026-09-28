"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { useActionState, useMemo, useState } from "react";
import { confirmSubmit } from "@/app/components/feedback";
import {
  selectParticipantsAction,
  restoreEnrollmentAction,
  removeParticipantAction,
  addParticipantAction,
  type RestoreState,
  type ParticipantState,
} from "./actions";

// 모집 단계(RECRUITING) 평가의 신청자 선발 화면.
// 신청은 정원을 넘어서도 받으므로, 여기서 생성자가 신청자를 보고 고른다.
//
// 필터에 걸러진 행은 언마운트하지 않고 CSS 로 숨긴다. 체크박스는 렌더된 것만 전송되므로
// 언마운트하면 선택한 사람이 비선발로 처리된다.

type Enrollment = {
  id: string;
  userId: string;
  userName: string;
  userStudentId: string;
  userMajor: string;
  userResponseCount: number;
  status: string;
  createdAt: string;
};

type Project = {
  id: string;
  title: string;
  status: string;
  responses?: { userId: string }[];
  minParticipants: number;
  maxParticipants: number;
  enrollmentDeadline: string | null;
  enrollments: Enrollment[];
};

// 학번 앞 4자리 = 입학연도. 비관리자에게는 마스킹되지만 앞 4자리는 남는다.
function admissionYear(studentId: string): string {
  const m = studentId.match(/^(\d{4})/);
  return m ? m[1] : "";
}

export default function RecruitPanel({
  project,
  onBack,
  isAdmin,
}: {
  project: Project;
  onBack: () => void;
  isAdmin: boolean;
}) {
  // 진행 중에는 선발 대신 참여자 관리 화면을 보여준다(선발은 모집 중에만 가능).
  if (project.status === "ACTIVE") {
    return <ParticipantManager project={project} onBack={onBack} isAdmin={isAdmin} />;
  }
  return <RecruitSelector project={project} onBack={onBack} />;
}

function RecruitSelector({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
}) {
  const enrollments = project.enrollments;

  // 이미 선발된 사람이 있으면 그 선택을 이어받고, 없으면 빈 상태에서 시작한다
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(enrollments.filter((e) => e.status === "ACCEPTED").map((e) => e.userId))
  );

  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [query, setQuery] = useState("");

  const majors = useMemo(
    () => [...new Set(enrollments.map((e) => e.userMajor).filter(Boolean))].sort(),
    [enrollments]
  );
  const years = useMemo(
    () => [...new Set(enrollments.map((e) => admissionYear(e.userStudentId)).filter(Boolean))].sort(),
    [enrollments]
  );

  const matches = (e: Enrollment) => {
    if (major && e.userMajor !== major) return false;
    if (year && admissionYear(e.userStudentId) !== year) return false;
    if (query && !e.userName.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  };

  const visible = enrollments.filter(matches);
  const count = selected.size;
  const overCapacity = count > project.maxParticipants;
  const belowMinimum = count < project.minParticipants;

  const toggle = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  // 전체 선택/해제는 "현재 필터에 걸린 사람"에게만 적용한다
  const selectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((e) => next.add(e.userId));
      return next;
    });
  const clearVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((e) => next.delete(e.userId));
      return next;
    });

  return (
    <div className="bg-white rounded-[var(--radius-xl)] p-8">
      <button
        onClick={onBack}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        &larr; 뒤로
      </button>

      <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">참여자 선발</h2>
      <p className="text-sm text-[var(--muted)] mb-6">{project.title}</p>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{enrollments.length}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">신청</p>
        </div>
        <div
          className={`rounded-[var(--radius-md)] p-4 text-center ${
            overCapacity ? "bg-[var(--danger-light)]" : "bg-[var(--accent-light)]"
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              overCapacity ? "text-[var(--danger)]" : "text-[var(--accent)]"
            }`}
          >
            {count}
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5">선택</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{project.maxParticipants}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">정원</p>
        </div>
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-[var(--gray-500)] text-center py-12">
          아직 신청자가 없습니다.
        </p>
      ) : (
        <form
          action={selectParticipantsAction}
          className="space-y-4"
          onSubmit={(ev) => {
            // 안쪽 복구 폼의 submit 이벤트가 버블링되므로 이 폼의 제출만 처리한다.
            if (ev.target !== ev.currentTarget) return;
            // 누른 버튼에 따라 확인 문구를 고른다. 「평가 시작」은 결과 알림이 바로 나간다.
            const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const starting = submitter?.name === "start";
            const others = enrollments.length - count;
            const msg = starting
              ? `이 ${count}명으로 평가를 시작합니다.\n\n` +
                `· 선발된 ${count}명에게 선발 알림${others > 0 ? `, 나머지 ${others}명에게 비선발 알림` : ""}이 즉시 나갑니다.\n` +
                `· 시작한 뒤에는 선발을 다시 할 수 없습니다. 인원 조정은 관리자가 한 명씩 제외·추가합니다.\n` +
                `· 선발된 학생은 스스로 참여를 취소할 수 없습니다.\n\n` +
                `평가를 시작할까요?`
              : `선택한 ${count}명을 선발 후보로 저장합니다.` +
                (others > 0 ? ` 선택하지 않은 ${others}명은 비선발로 표시됩니다.` : "") +
                `\n(알림은 아직 나가지 않고, 평가를 시작할 때 나갑니다)\n\n저장할까요?`;
            confirmSubmit(ev, msg);
          }}
        >
          <input type="hidden" name="projectId" value={project.id} />

          {/* 필터 */}
          <div className="flex flex-wrap gap-2">
            <select
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">전공 전체</option>
              {majors.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">학번 전체</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}학번
                </option>
              ))}
            </select>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색"
              className="flex-1 min-w-[140px] px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] placeholder:text-[var(--gray-400)]"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">
              {visible.length}명 표시 중
              {visible.length !== enrollments.length && ` (전체 ${enrollments.length}명)`}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={selectAllVisible}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                표시된 항목 전체 선택
              </button>
              <button
                type="button"
                onClick={clearVisible}
                className="font-medium text-[var(--muted)] hover:underline"
              >
                선택 해제
              </button>
            </div>
          </div>

          {/* 취소된 신청 복구. 마감 후에는 학생이 다시 신청할 수 없어 한 건씩 되살린다. */}
          <RestoreEnrollment projectId={project.id} />

          {/* 신청자 목록 */}
          <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)] max-h-[420px] overflow-y-auto custom-scrollbar">
            {visible.length === 0 && (
              <p className="text-sm text-[var(--gray-500)] text-center py-8">
                조건에 맞는 신청자가 없습니다.
              </p>
            )}
            {enrollments.map((e) => {
              const checked = selected.has(e.userId);
              return (
                <label
                  key={e.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    matches(e) ? "" : "hidden"
                  } ${checked ? "bg-[var(--accent-light)]/40" : "hover:bg-[var(--surface)]"}`}
                >
                  <input
                    type="checkbox"
                    name="accepted"
                    value={e.userId}
                    checked={checked}
                    onChange={() => toggle(e.userId)}
                    className="w-4 h-4 shrink-0 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">
                      {e.userName}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        {e.userStudentId}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                      {e.userMajor || "전공 미입력"} · 과거 참여 {e.userResponseCount}회
                    </p>
                  </div>
                  {e.status === "REJECTED" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)] shrink-0">
                      이전 비선발
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {/* 경고 */}
          {overCapacity && (
            <p className="text-xs text-[var(--danger)]">
              정원({project.maxParticipants}명)보다 {count - project.maxParticipants}명 많이 선택했습니다.
            </p>
          )}
          {!overCapacity && belowMinimum && (
            <p className="text-xs text-[var(--muted)]">
              최소 인원 {project.minParticipants}명을 채워야 평가를 시작할 수 있습니다.
            </p>
          )}

          {/* 액션 */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <SubmitButton
              type="submit"
              disabled={overCapacity}
              className="flex-1 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] font-medium text-sm hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              선발 저장 (모집 계속)
            </SubmitButton>
            <SubmitButton
              type="submit"
              name="start"
              value="1"
              disabled={overCapacity || belowMinimum}
              className="flex-1 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-dark)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all"
            >
              이 {count}명으로 평가 시작
            </SubmitButton>
          </div>
          <p className="text-xs text-[var(--muted)] text-center">
            평가를 시작하면 선발된 신청자에게만 응답 권한이 부여되고, 선발 결과가 모두에게 알림으로 전달됩니다.
          </p>
        </form>
      )}
    </div>
  );
}


/** 취소된 신청을 학번으로 되살린다. 복구된 신청은 PENDING 이고 선발 때 정원이 적용된다. */
function RestoreEnrollment({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<RestoreState | null, FormData>(
    restoreEnrollmentAction,
    null,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
      >
        실수로 취소한 신청 복구하기
      </button>
    );
  }

  return (
    <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)] space-y-2">
      <p className="text-xs text-[var(--gray-600)] leading-relaxed">
        학생이 실수로 신청을 취소했는데 신청 기한이 지나 다시 신청할 수 없을 때 씁니다.
        복구하면 <strong>신청 대기(PENDING)</strong> 상태가 되므로, 아래 목록에서 선발해야
        응답할 수 있습니다.
      </p>
      <form
        action={formAction}
        className="flex gap-2"
        onSubmit={(ev) => {
          const id = (new FormData(ev.currentTarget).get("studentId") as string)?.trim();
          confirmSubmit(ev, `${id} 의 참여 신청을 복구합니다. 복구된 신청은 선발 대기 상태가 되고 본인에게 알림이 갑니다.\n\n복구할까요?`);
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input
          name="studentId"
          required
          placeholder="학번 · 사번"
          className="flex-1 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
        />
        <button
          disabled={pending}
          className="px-3.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] disabled:opacity-50 transition-colors"
        >
          {pending ? "복구 중…" : "복구"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-xs rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--gray-600)] hover:bg-white transition-colors"
        >
          닫기
        </button>
      </form>
      {state?.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state?.ok && <p className="text-xs text-[var(--accent)]">{state.ok}</p>}
    </div>
  );
}

/**
 * 진행 중(ACTIVE) 평가의 참여자 관리. 제외·추가는 ADMIN 만 할 수 있고 개설자는 명단만 본다.
 */
function ParticipantManager({
  project,
  onBack,
  isAdmin,
}: {
  project: Project;
  onBack: () => void;
  isAdmin: boolean;
}) {
  const responded = new Set((project.responses || []).map((r) => r.userId));
  const accepted = project.enrollments.filter((e) => e.status === "ACCEPTED");
  const removed = project.enrollments.filter((e) => e.status === "REMOVED");
  const respondedCount = accepted.filter((e) => responded.has(e.userId)).length;

  return (
    <div className="bg-white rounded-[var(--radius-xl)] p-8">
      <button
        onClick={onBack}
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        &larr; 뒤로
      </button>

      <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">참여자 관리</h2>
      <p className="text-sm text-[var(--muted)] mb-6">{project.title}</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-[var(--radius-md)] bg-[var(--accent-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent)]">{accepted.length}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">참여자</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{respondedCount}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">응답 완료</p>
        </div>
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{project.maxParticipants}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">정원</p>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-[var(--muted)] mb-4">
          참여자 제외·추가는 관리자만 할 수 있습니다. 필요하면 관리자에게 요청해 주세요.
        </p>
      )}

      {isAdmin && <AddParticipant projectId={project.id} />}

      <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)] max-h-[420px] overflow-y-auto custom-scrollbar">
        {accepted.length === 0 && (
          <p className="text-sm text-[var(--gray-500)] text-center py-8">참여자가 없습니다.</p>
        )}
        {accepted.map((e) => (
          <ParticipantRow
            key={e.id}
            projectId={project.id}
            enrollment={e}
            responded={responded.has(e.userId)}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {removed.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-[var(--gray-600)] mb-2">
            제외된 사람 ({removed.length}명)
          </p>
          <div className="border border-[var(--gray-200)] rounded-[var(--radius-lg)] divide-y divide-[var(--gray-100)]">
            {removed.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <p className="flex-1 min-w-0 text-sm text-[var(--gray-500)] truncate">
                  {e.userName}
                  <span className="ml-2 text-xs">{e.userStudentId}</span>
                </p>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)] shrink-0">
                  제외됨
                </span>
              </div>
            ))}
          </div>
          {isAdmin && (
            <p className="text-xs text-[var(--muted)] mt-1.5">
              다시 넣으려면 위 「참여자 추가」에 학번을 입력하세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  projectId,
  enrollment,
  responded,
  isAdmin,
}: {
  projectId: string;
  enrollment: Enrollment;
  responded: boolean;
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<ParticipantState | null, FormData>(
    removeParticipantAction,
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--foreground)] truncate">
            {enrollment.userName}
            <span className="ml-2 text-xs font-normal text-[var(--muted)]">{enrollment.userStudentId}</span>
          </p>
          <p className="text-xs text-[var(--muted)] truncate mt-0.5">
            {enrollment.userMajor || "전공 미입력"}
          </p>
        </div>
        {responded ? (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] shrink-0">
            응답 완료
          </span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--gray-100)] text-[var(--gray-500)] shrink-0">
            미응답
          </span>
        )}
        {/* 응답한 사람은 보상이 있어 제외할 수 없다. */}
        {isAdmin && !responded && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-2.5 py-1 text-xs rounded-[var(--radius-md)] border border-red-200 text-red-600 hover:bg-red-50 transition-colors shrink-0"
          >
            제외
          </button>
        )}
      </div>

      {open && (
        <form
          action={formAction}
          className="mt-2 flex gap-2"
          onSubmit={(ev) => {
            const reason = (new FormData(ev.currentTarget).get("reason") as string)?.trim();
            const msg =
              `${enrollment.userName}(${enrollment.userStudentId})님을 이 평가에서 제외합니다.\n\n` +
              `· 즉시 응답할 수 없게 되고, 본인에게 제외 알림이 갑니다${reason ? " (사유 포함)" : ""}.\n` +
              `· 기록은 지워지지 않고 「제외됨」으로 남으며, 관리자 조작 기록에도 남습니다.\n` +
              `· 되돌리려면 「참여자 추가」로 다시 넣어야 합니다.\n\n` +
              `제외할까요?`;
            confirmSubmit(ev, { message: msg, confirmLabel: "제외", danger: true });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="userId" value={enrollment.userId} />
          <input
            name="reason"
            maxLength={200}
            placeholder="사유 (선택 · 본인에게 전달됩니다)"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-red-400 transition-colors"
          />
          <button
            disabled={pending}
            className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {pending ? "처리 중…" : "제외 확정"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--gray-600)] hover:bg-[var(--surface)] transition-colors shrink-0"
          >
            취소
          </button>
        </form>
      )}
      {state?.error && <p className="text-xs text-[var(--danger)] mt-1.5">{state.error}</p>}
      {state?.ok && <p className="text-xs text-[var(--accent)] mt-1.5">{state.ok}</p>}
    </div>
  );
}

function AddParticipant({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ParticipantState | null, FormData>(
    addParticipantAction,
    null,
  );

  return (
    <div className="p-3 mb-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)] space-y-2">
      <p className="text-xs font-semibold text-[var(--gray-600)]">참여자 추가</p>
      <form
        action={formAction}
        className="flex gap-2"
        onSubmit={(ev) => {
          const id = (new FormData(ev.currentTarget).get("loginId") as string)?.trim();
          const msg =
            `${id} 회원을 이 평가의 참여자로 바로 추가합니다.\n\n` +
            `· 선발 절차 없이 즉시 응답할 수 있게 되고, 본인에게 알림이 갑니다.\n` +
            `· 정원이 차 있으면 추가되지 않습니다(먼저 제외가 필요합니다).\n` +
            `· 관리자 조작 기록에 남습니다.\n\n` +
            `추가할까요?`;
          confirmSubmit(ev, msg);
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input
          name="loginId"
          required
          placeholder="학번 또는 이메일"
          className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
        />
        <button
          disabled={pending}
          className="px-3.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] disabled:opacity-50 transition-colors"
        >
          {pending ? "추가 중…" : "추가"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state?.ok && <p className="text-xs text-[var(--accent)]">{state.ok}</p>}
    </div>
  );
}
