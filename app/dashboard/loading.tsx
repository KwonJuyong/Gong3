/** 대시보드 하위 화면을 불러오는 동안 본문 자리에 보이는 골격 */
export default function DashboardLoading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="불러오는 중">
      <div className="h-7 w-48 rounded-[var(--radius-md)] bg-[var(--gray-200)] animate-pulse" />
      <div className="h-4 w-80 max-w-full mt-3 rounded bg-[var(--gray-100)] animate-pulse" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-[var(--radius-xl)] bg-white animate-pulse" />
        ))}
      </div>
      <div className="mt-4 h-72 rounded-[var(--radius-xl)] bg-white animate-pulse" />
    </div>
  );
}
