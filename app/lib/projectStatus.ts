// 평가 상태 라벨·색. 학생·개설자 화면 모두 이 함수만 사용
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
