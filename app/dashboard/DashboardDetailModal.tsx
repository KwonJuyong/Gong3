"use client";

import Link from "next/link";
import { statusMeta } from "@/app/lib/projectStatus";
import { sendMessageAction, sendProjectAnnouncementAction } from "../actions";
import { ProjectGuidesList } from "../components/ProjectGuidesField";
import SubmitButton from "../components/SubmitButton";
import { confirmSubmit, toast } from "../components/feedback";
import { ui } from "../components/ui";
import {
  cancelEnrollmentAction,
  deleteProjectAction,
  enrollProjectAction,
  finishProjectAction,
} from "./actions";
import {
  canManageProject,
  QTYPE_LABEL,
  type DashboardProject,
  type DashboardUser,
} from "./dashboardTypes";

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

const SECONDARY_BTN =
  "flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--gray-50)] transition-colors";

export default function DashboardDetailModal({
  selected,
  user,
  enrollClosed,
  answerClosed,
  onClose,
  onNavigate,
}: {
  selected: DashboardProject | null;
  user: DashboardUser;
  enrollClosed: boolean;
  answerClosed: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

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
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-[var(--radius-md)] border border-[var(--gray-200)] flex items-center justify-center text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!selected ? (
          <p className="text-sm text-[var(--muted)] mt-3">삭제되었거나 볼 권한이 없는 평가입니다.</p>
        ) : (
          <DetailBody
            selected={selected}
            user={user}
            enrollClosed={enrollClosed}
            answerClosed={answerClosed}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}

function DetailBody({
  selected,
  user,
  enrollClosed,
  answerClosed,
  onNavigate,
}: {
  selected: DashboardProject;
  user: DashboardUser;
  enrollClosed: boolean;
  answerClosed: boolean;
  onNavigate: (url: string) => void;
}) {
  const enrollments = selected.enrollments || [];
  const myEnrollment = enrollments.find((e) => e.userId === user.id);
  const isEnrolled = !!myEnrollment;
  const isAccepted = myEnrollment?.status === "ACCEPTED";
  const isPending = myEnrollment?.status === "PENDING";
  const isRejected = myEnrollment?.status === "REJECTED";
  const isRemoved = myEnrollment?.status === "REMOVED";
  const isRecruiting = selected.status === "RECRUITING";
  const isActive = selected.status === "ACTIVE";
  const isOpen = isRecruiting || isActive;
  const canCancel = isRecruiting || (!isAccepted && !isRemoved && isActive);
  const enrollmentCount = selected.enrollmentCount ?? enrollments.length;
  const acceptedCount = selected.acceptedCount ?? enrollments.filter((e) => e.status === "ACCEPTED").length;
  const pendingCount = enrollments.filter((e) => e.status === "PENDING").length;
  const deadlinePassed = selected.enrollmentDeadline ? new Date() > new Date(selected.enrollmentDeadline) : false;
  const isCreatorOrAdmin = canManageProject(user, selected);
  const myResponse = (selected.responses || []).find((r) => r.userId === user.id);
  const accompany = selected.evalMode === "ACCOMPANY";
  const capacity = selected.capacity ?? selected.maxParticipants ?? 10;
  const canLateEnroll = isActive && !selected.closedAt && acceptedCount < capacity;
  const questions = Array.isArray(selected.questions) ? selected.questions : [];
  const primaryBtn = `${ui.primary} w-full gap-1.5`;
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
        {selected.rewardPerPerson > 0 && (
          <>
            <dt className="text-[var(--muted)]">보상</dt>
            <dd className="text-[var(--foreground)] font-medium">
              1인 {Number(selected.rewardPerPerson).toLocaleString("ko-KR")}원{" "}
              <span className="text-xs text-[var(--muted)] font-normal">(세전, 검수 후 지급)</span>
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
      <ProjectGuidesList guides={selected.guides} />
      {selected.link && (
        <p className="text-sm break-all">
          <span className="text-[var(--muted)]">평가할 서비스 </span>
          <a href={selected.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2">
            {selected.link.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        </p>
      )}

      {selected.status === "DRAFT" && (
        <p className="text-sm text-[var(--gray-800)] bg-[var(--gray-100)] px-3 py-2.5 rounded-[var(--radius-md)]">
          작성 중이에요. 과제 인터뷰와 모집·비용을 마치면 승인을 요청해요.{" "}
          <Link href={selected.taskStatus ? `/dashboard/accompany/${selected.id}/recruit` : `/dashboard?view=task&p=${selected.id}`} className="underline font-semibold">
            이어서 만들기
          </Link>
        </p>
      )}
      {selected.status === "PENDING_APPROVAL" && (
        <p className="text-sm text-[var(--gray-800)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          관리자 승인을 기다리는 중입니다. 승인되면 평가자 모집이 시작되고 알림이 갑니다.
          아직 학생에게는 보이지 않습니다.
        </p>
      )}
      {selected.status === "REJECTED" && (
        <div className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)] space-y-2">
          <p>
            <strong>반려되었습니다.</strong>
            {selected.rejectReason ? ` 사유: ${selected.rejectReason}` : ""} 내용을 고쳐 새로 요청해 주세요.
          </p>
          {isCreatorOrAdmin && (
            <button type="button" onClick={() => onNavigate(`/dashboard?view=edit&p=${selected.id}`)} className={SECONDARY_BTN}>
              고쳐서 다시 요청하기
            </button>
          )}
        </div>
      )}

      {isCreatorOrAdmin && selected.needsOrder && selected.status !== "FINISHED" && selected.status !== "REJECTED" && (
        <p className="text-sm text-[var(--gray-800)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          평가 의뢰가 연결되지 않아 학생 참여 보상이 생기지 않아요.{" "}
          <Link href="/dashboard/orders" className="underline font-semibold">평가 의뢰</Link>를 내고 의뢰 화면에서 이 평가에 연결해 주세요.
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

      {answerClosed && (
        <p role="alert" className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          지금은 이 평가에 응답할 수 없어 저장되지 않았어요. 작성한 내용은 이 기기에 남아 있어요.
        </p>
      )}
      {enrollClosed && !isEnrolled && (
        <p role="alert" className="text-sm text-[var(--danger)] bg-[var(--danger-light)] px-3 py-2.5 rounded-[var(--radius-md)]">
          신청하는 사이 모집이 마감되어 신청되지 않았어요.
        </p>
      )}

      <div className="space-y-2">
        {accompany && isCreatorOrAdmin && (selected.status !== "FINISHED" || selected.taskStatus === "published") && (
          <Link className={selected.taskStatus ? `${SECONDARY_BTN} w-full` : primaryBtn} href={`/dashboard?view=task&p=${selected.id}`}>
            {selected.taskStatus === "published" ? `학생 과제와 의견 보기 (${selected.responseCount ?? 0})` : selected.taskStatus ? "과제 내용 검토" : "Evi와 과제 정하기"}
          </Link>
        )}
        {accompany && isAccepted && (selected.taskStatus === "published" ? (
          <Link className={primaryBtn} href={`/dashboard?view=task&p=${selected.id}`}>
            {myResponse ? "내 과제와 기록 보기" : "과제 시작하기"}
          </Link>
        ) : isActive && (
          <p className="text-sm text-center text-[var(--gray-700)] bg-[var(--accent-light)] rounded-[var(--radius-md)] py-2.5">
            Evi 과제를 준비하고 있어요. 공개되면 알림으로 알려 드려요.
          </p>
        ))}
        {isCreatorOrAdmin && isRecruiting && (
          <button type="button" onClick={() => onNavigate(`/dashboard?view=recruit&p=${selected.id}`)} className={primaryBtn}>
            신청자 선발 ({enrollments.length}명 신청{acceptedCount > 0 ? ` · ${acceptedCount}명 선발됨` : ""})
          </button>
        )}
        {isCreatorOrAdmin && isActive && (
          <button type="button" onClick={() => onNavigate(`/dashboard?view=recruit&p=${selected.id}`)} className={`${SECONDARY_BTN} w-full`}>
            평가자 관리 ({acceptedCount}명 참여 중{pendingCount > 0 ? ` · 추가 신청 ${pendingCount}명` : ""})
          </button>
        )}

        {!accompany && isAccepted && isActive && (
          <button type="button" onClick={() => onNavigate(`/dashboard?view=eval&p=${selected.id}`)} className={primaryBtn}>
            {myResponse ? "내 응답 보기·고치기" : "평가 응답하기"}
          </button>
        )}
        {isRecruiting && isEnrolled && (
          <p className="text-sm text-center text-[var(--gray-700)] bg-[var(--accent-light)] rounded-[var(--radius-md)] py-2.5">
            신청이 접수되었습니다. 선발 결과는 알림으로 알려드립니다.
          </p>
        )}
        {isActive && isPending && (
          <p className="text-sm text-center text-[var(--gray-700)] bg-[var(--accent-light)] rounded-[var(--radius-md)] py-2.5">
            추가 참여 신청이 접수되었어요. 관리자가 수락하면 알림으로 알려 드려요.
          </p>
        )}
        {isActive && isEnrolled && !isAccepted && !isPending && (
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
          <form
            action={enrollProjectAction}
            onSubmit={(e) =>
              confirmSubmit(e, {
                message:
                  `"${selected.title}"에 참여를 신청할까요?\n\n` +
                  "· 개설자에게 신청 알림이 가요.\n" +
                  "· 선발되면 알림으로 알려 드려요. 모집 중에는 직접 취소할 수 있어요.",
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
          canLateEnroll ? (
            <form
              action={enrollProjectAction}
              onSubmit={(e) =>
                confirmSubmit(e, {
                  message:
                    `"${selected.title}"에 추가 참여를 신청할까요?\n\n` +
                    "· 정원에 빈자리가 있어 추가 신청할 수 있어요.\n" +
                    "· 관리자가 수락하면 알림으로 알려 드려요.",
                  confirmLabel: "추가 참여 신청",
                })
              }
            >
              <input type="hidden" name="projectId" value={selected.id} />
              <SubmitButton pendingText="신청 중…" className={primaryBtn}>
                추가 참여 신청
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-center text-[var(--muted)] py-2">모집이 끝난 평가입니다.</p>
          )
        )}
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

      {isCreatorOrAdmin && !accompany && (
        <div className="flex gap-2">
          <button type="button" onClick={() => onNavigate(`/dashboard?view=result&p=${selected.id}`)} className={SECONDARY_BTN}>
            결과 보기 ({selected.responseCount ?? 0})
          </button>
          <a href={`/api/export?projectId=${selected.id}`} className={SECONDARY_BTN}>
            엑셀 내보내기
          </a>
        </div>
      )}

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
            <SubmitButton pendingText="…" className={ui.primarySm}>
              보내기
            </SubmitButton>
          </form>
        </details>
      )}

      {isCreatorOrAdmin && (
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
                <button type="button" onClick={() => onNavigate(`/dashboard?view=edit&p=${selected.id}`)} className={SECONDARY_BTN}>
                  수정
                </button>
              )}
              {isOpen && (
                <form
                  action={finishProjectAction}
                  className="flex-1 flex"
                  onSubmit={(e) =>
                    confirmSubmit(e, {
                      message: accompany
                        ? `"${selected.title}" 평가를 종료할까요?\n\n` +
                          `· 새로 첫 사용 기록을 남길 수 없어요(현재 기록 ${selected.responseCount ?? 0}건).\n` +
                          `· 참여한 학생에게 종료 알림이 가요.\n` +
                          `· 학생 요청에 답하고 고친 버전으로 재평가를 요청하는 일은 계속할 수 있어요.\n` +
                          `· 종료한 평가는 다시 열 수 없어요.`
                        : `"${selected.title}" 평가를 종료합니다.\n\n` +
                          `· 더 이상 응답을 받지 않습니다(현재 응답 ${selected.responseCount ?? 0}건).\n` +
                          `· 응답한 평가자 전원에게 종료 알림이 나갑니다.\n` +
                          `· 종료한 평가는 화면에서 다시 열 수 없습니다.\n\n정말 종료하시겠습니까?`,
                      confirmLabel: "평가 종료",
                      danger: true,
                    })
                  }
                >
                  <input type="hidden" name="projectId" value={selected.id} />
                  <SubmitButton pendingText="종료 중…" className={SECONDARY_BTN}>
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

      {accompany ? (
        <div className="border-t border-[var(--gray-100)] pt-4">
          <p className="text-xs font-medium text-[var(--muted)] mb-1">평가 방식</p>
          <p className="text-sm text-[var(--foreground)]">Evi 동행 평가 · 문항 없이 Evi와 과제를 하며 기록을 남겨요.</p>
        </div>
      ) : (
        <div className="border-t border-[var(--gray-100)] pt-4">
          <p className="text-xs font-medium text-[var(--muted)] mb-2">
            {selected.questionSource === "AUTO" ? "표준 설문" : "자유 설문"} · 평가문항 {questions.length}개
          </p>
          <ol className="space-y-1.5">
            {questions.slice(0, 5).map((q, i) => (
              <li key={i} className="bg-[var(--surface)] rounded-[var(--radius-md)] px-3.5 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--foreground)] truncate">
                  {q.type === "semantic7" ? `${q.leftLabel} ↔ ${q.rightLabel}` : q.label}
                </span>
                <span className="text-xs text-[var(--muted)] shrink-0">{QTYPE_LABEL[q.type] ?? ""}</span>
              </li>
            ))}
          </ol>
          {questions.length > 5 && (
            <p className="text-xs text-[var(--muted)] pl-1 mt-1.5">외 {questions.length - 5}개</p>
          )}
        </div>
      )}
    </div>
  );
}
