import Link from "next/link";

/**
 * 대시보드의 "내 보상" 패널(서버 컴포넌트).
 *
 * 보상이 생기기 전에 계좌를 미리 입력할 수 있도록 항상 보여준다.
 * 입력은 프로필의 정산 정보 탭에서 하고, 여기서는 요약과 계좌 미등록 경고만 보여준다.
 * summary 가 null 이면 아직 보상이 없는 상태다.
 */

export interface RewardBucket {
  count: number;
  amount: number;
}

export interface MyRewardSummary {
  /** 검수 대기(승인 전이라 세전 금액) */
  reviewing: RewardBucket;
  /** 승인됐지만 아직 미지급(실수령액) */
  upcoming: RewardBucket;
  /** 지급 완료(실수령액) */
  paid: RewardBucket;
  rejected: number;
  /** 원천징수 누계 (표시용) */
  taxTotal: number;
}

export interface ProfileProps {
  bankName: string;
  accountNumber: string;
  /** 예금주. 비어 있으면 본인 이름으로 이체한다. */
  holderName: string;
  hasRrn: boolean;
  payoutReady: boolean;
  withholdingReady: boolean;
  byAdmin: boolean;
}

const won = (n: number) => "₩" + n.toLocaleString("ko-KR");

const SETTLEMENT_HREF = "/dashboard/profile?tab=settlement";

const Icon = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-3.5 h-3.5 shrink-0"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const I_EDIT =
  "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z";
const I_CARD = "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7ZM2 10h20M6 15h4";

export default function MyRewardsPanel({
  summary,
  profile,
}: {
  /** null 이면 아직 보상이 없고 계좌 안내만 보인다. */
  summary: MyRewardSummary | null;
  profile: ProfileProps;
}) {
  const total = summary
    ? summary.reviewing.count + summary.upcoming.count + summary.paid.count
    : 0;

  // 세금·영수증 안내는 접어 두고, 계좌 상태는 항상 보인다.
  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[17px] font-bold text-[var(--foreground)]">내 보상</h2>
        {summary && <span className="text-sm text-[var(--muted)]">{total}건</span>}
      </div>

      {summary ? (
        <dl className="divide-y divide-[var(--gray-100)]">
          {summary.reviewing.count > 0 && <Row label="검수 중" value={won(summary.reviewing.amount)} tone="warning" />}
          {summary.upcoming.count > 0 && <Row label="지급 예정" value={won(summary.upcoming.amount)} tone="accent" />}
          {summary.paid.count > 0 && <Row label="받은 보상" value={won(summary.paid.amount)} tone="plain" />}
          {summary.rejected > 0 && <Row label="반려" value={`${summary.rejected}건`} tone="plain" />}
        </dl>
      ) : (
        <p className="text-sm text-[var(--muted)]">보상이 있는 평가에 참여하면 여기에 쌓여요.</p>
      )}

      {/* 계좌 상태 */}
      <div className="mt-3 pt-3 border-t border-[var(--gray-100)]">
        {!profile.payoutReady ? (
          <Link
            href={SETTLEMENT_HREF}
            className={`flex items-center justify-between gap-2 px-3.5 py-3 rounded-[var(--radius-md)] text-sm font-semibold ${
              summary ? "bg-[var(--danger-light)] text-[var(--danger)]" : "bg-[var(--accent-light)] text-[var(--accent)]"
            }`}
          >
            <span>{summary ? "계좌가 없어 지급할 수 없어요" : "보상 받을 계좌 등록하기"}</span>
            <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <Link href={SETTLEMENT_HREF} className="flex items-center justify-between gap-2 -mx-2 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--foreground)] truncate">
                {profile.bankName} {maskAccount(profile.accountNumber)}
              </span>
              <span className="block text-[13px] text-[var(--muted)] truncate">
                {profile.holderName ? `예금주 ${profile.holderName}` : "예금주 미입력"}
                {profile.hasRrn ? "" : " · 주민번호 미등록"}
              </span>
            </span>
            <span className="text-sm text-[var(--gray-600)] shrink-0">수정 ›</span>
          </Link>
        )}

        {profile.byAdmin && (
          <p className="text-[13px] text-[var(--warning)] mt-2">관리자가 대신 입력한 정보예요. 맞는지 확인해 주세요.</p>
        )}
        {profile.payoutReady && !profile.withholdingReady && (
          <p className="text-[13px] text-[var(--muted)] mt-2">주민등록번호가 없으면 원천징수 신고 서류를 만들 수 없어요.</p>
        )}
      </div>

      {summary && (summary.taxTotal > 0 || summary.paid.count > 0) && (
        <details className="mt-3">
          <summary className="text-[13px] text-[var(--gray-600)] cursor-pointer">세금·영수증 안내</summary>
          <div className="text-[13px] text-[var(--muted)] mt-2 space-y-1.5 leading-relaxed">
            {summary.taxTotal > 0 && <p>원천징수 누계 {won(summary.taxTotal)} — 받은 금액은 세금을 뺀 금액입니다.</p>}
            {/* 원천징수영수증은 지급명세서 제출 후 학생이 홈택스에서 직접 출력한다. */}
            {summary.paid.count > 0 && (
              <p>
                원천징수영수증은{" "}
                <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer" className="underline">
                  홈택스
                </a>
                에서 발급합니다 — 나의 홈택스 &gt; 소득·연말정산 &gt; 지급명세서·원천징수영수증 내역.
              </p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

const TONE: Record<string, string> = {
  warning: "text-[var(--warning)]",
  accent: "text-[var(--accent)]",
  plain: "text-[var(--foreground)]",
};

function Row({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-[15px] text-[var(--gray-700)]">{label}</dt>
      <dd className={`text-[15px] font-bold tabular-nums ${TONE[tone]}`}>{value}</dd>
    </div>
  );
}

/** 계좌번호 뒤 4자리만 보여준다 */
function maskAccount(v: string): string {
  const s = (v || "").replace(/[^0-9]/g, "");
  if (s.length <= 4) return s;
  return "*".repeat(Math.min(s.length - 4, 8)) + s.slice(-4);
}
