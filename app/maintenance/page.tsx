export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="w-full max-w-[480px] text-center">
        <div className="bg-white rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--gray-200)] p-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--warning-light)] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--gray-900)] mb-2 tracking-tight">
            서버 점검 중
          </h1>
          <p className="text-sm text-[var(--muted)] mb-6 leading-relaxed">
            더 나은 서비스를 위해 시스템 점검을 진행하고 있습니다.<br />
            잠시 후 다시 접속해 주세요.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] text-xs text-[var(--muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse" />
            점검 진행 중
          </div>
        </div>
        <p className="text-xs text-[var(--gray-500)] mt-4">
          문의: labchain.hallym@gmail.com
        </p>
      </div>
    </main>
  );
}
