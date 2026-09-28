import Link from "next/link";
import type { Completion } from "../../lib/profileCompletion";

/**
 * 프로필 상단: 아바타·이름·역할과 완성도 게이지.
 * 비어 있으면 지급이 막히는 항목(blocking)은 따로 링크로 보여준다.
 */

export default function ProfileHeader({
  name,
  studentId,
  roleLabel,
  idLabel,
  profileImage,
  completion,
}: {
  name: string;
  studentId: string;
  roleLabel: string;
  idLabel: string;
  profileImage: string | null;
  completion: Completion;
}) {
  const initials = name.charAt(0).toUpperCase();
  const pct = completion.percent;
  const tone =
    pct === 100 ? "var(--success)" : pct >= 60 ? "var(--accent)" : "var(--warning)";
  const blocking = completion.missing.filter((m) => m.blocking);

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-8">
      <div className="bg-white rounded-[var(--radius-xl)] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-[var(--gray-100)] text-[var(--gray-700)] text-xl font-semibold flex items-center justify-center shrink-0 overflow-hidden">
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileImage} alt={name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-[var(--foreground)] tracking-tight truncate">{name}</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5 truncate">
              {idLabel} {studentId} · {roleLabel}
            </p>
          </div>
          <div className="sm:w-56 shrink-0">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-[var(--gray-600)]">프로필 완성도</span>
              <span className="text-sm font-bold" style={{ color: tone }}>
                {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--gray-100)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: tone }} />
            </div>
          </div>
        </div>

        {/* 지급·서류가 막히는 항목만 따로 표시하고, 나머지는 탭의 점으로 표시한다. */}
        {blocking.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] bg-[var(--warning-light)] px-4 py-3 text-sm">
            <span className="text-[var(--gray-800)]">입력하지 않아 진행이 막히는 항목:</span>
            {blocking.map((m) => (
              <Link key={m.label} href={`/dashboard/profile?tab=${m.tab}`} className="font-semibold text-[var(--warning)] underline underline-offset-2">
                {m.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
