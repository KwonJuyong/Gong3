"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { Fragment, useMemo, useState } from "react";
import { saveSettlementProfileForUserAction } from "../settlementProfileActions";

/**
 * [ADMIN] 평가단 정산 정보 현황. 계좌가 없어 지급에서 빠질 사람을 확인하고 입력을 요청한다.
 * 대리입력도 가능하지만 예외용이다.
 */

export interface ProfileRow {
  userId: string;
  name: string;
  studentId: string;
  bankName: string;
  accountNumber: string;
  /** 예금주. 비면 본인 이름으로 이체한다. */
  holderName: string;
  address: string;
  hasRrn: boolean;
  rrnMasked: string;
  payoutReady: boolean;
  withholdingReady: boolean;
  byAdmin: boolean;
  consented: boolean;
  pendingRewards: number;
  /** 보상 이력이 있는가 */
  hasRewards: boolean;
  /** 서버에서 포맷한 문자열. 없으면 빈 문자열. */
  updatedAt: string;
  consentedAt: string;
}

const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
  "카카오뱅크", "토스뱅크", "케이뱅크", "새마을금고", "신협", "우체국",
  "부산은행", "대구은행", "광주은행", "전북은행", "경남은행", "제주은행",
  "산업은행", "수협은행", "SC제일은행", "씨티은행",
];

const INPUT =
  "w-full px-2.5 py-1.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--gray-400)]";

/** 정산 화면 버튼과 같은 스타일 */
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] transition-opacity";
const BTN_GHOST =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-[var(--gray-300)] text-[var(--muted)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] transition-colors";

const Icon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`w-3.5 h-3.5 shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const I_EDIT = "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z";
const I_SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3";
const I_CLOSE = "M18 6 6 18M6 6l12 12";

type Filter = "ALL" | "NO_ACCOUNT" | "NO_RRN" | "NO_CONSENT";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "NO_ACCOUNT", label: "계좌 미입력" },
  { key: "NO_RRN", label: "주민번호 없음" },
  { key: "NO_CONSENT", label: "동의 미확인" },
];

export default function ProfilesPanel({ rows }: { rows: ProfileRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const stat = useMemo(
    () => ({
      total: rows.length,
      withRewards: rows.filter((r) => r.hasRewards).length,
      account: rows.filter((r) => r.payoutReady).length,
      rrn: rows.filter((r) => r.hasRrn).length,
      // 주민번호는 있지만 본인 동의 기록이 없는 건(대리입력 등)
      noConsent: rows.filter((r) => r.hasRrn && !r.consented).length,
      // 받을 보상이 있는데 계좌가 없는 인원
      blocking: rows.filter((r) => !r.payoutReady && r.pendingRewards > 0).length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (filter === "NO_ACCOUNT" && r.payoutReady) return false;
      if (filter === "NO_RRN" && r.hasRrn) return false;
      if (filter === "NO_CONSENT" && !(r.hasRrn && !r.consented)) return false;
      if (q && !r.name.includes(q) && !r.studentId.includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const count = (key: Filter) => {
    if (key === "ALL") return stat.total;
    if (key === "NO_ACCOUNT") return stat.total - stat.account;
    if (key === "NO_RRN") return stat.total - stat.rrn;
    return stat.noConsent;
  };

  return (
    <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--gray-100)]">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">평가단 정산정보</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              계좌가 없으면 지급 생성에서 제외됩니다. 주민번호는 지급명세서용이라 이체는 됩니다.
            </p>
          </div>
        </div>

        {/* 상태 요약 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <Stat label="대상 인원" value={`${stat.total}명`} sub={`보상 발생 ${stat.withRewards}명`} />
          <Stat
            label="계좌 등록"
            value={`${stat.account} / ${stat.total}`}
            sub={stat.blocking > 0 ? `지급 대기 ${stat.blocking}명 막힘` : "지급 가능"}
            warn={stat.blocking > 0}
          />
          <Stat
            label="주민번호"
            value={`${stat.rrn} / ${stat.total}`}
            sub="지급명세서 대상"
          />
          <Stat
            label="동의 미확인"
            value={`${stat.noConsent}명`}
            sub="본인 확인 필요"
            warn={stat.noConsent > 0}
          />
        </div>
      </div>

      {/* 검색·필터 */}
      <div className="px-5 py-3 border-b border-[var(--gray-100)] flex items-center gap-2 flex-wrap bg-[var(--gray-50)]">
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gray-500)]">
            <Icon d={I_SEARCH} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 학번"
            className="w-full pl-8 pr-8 py-1.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-200)] text-xs outline-none focus:border-[var(--accent)] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--gray-500)] hover:text-[var(--foreground)]"
            >
              <Icon d={I_CLOSE} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const n = count(f.key);
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors ${
                  active
                    ? "bg-[var(--accent)] text-white border-[var(--gray-900)]"
                    : "bg-white border-[var(--gray-200)] text-[var(--muted)] hover:bg-white hover:border-[var(--gray-300)]"
                }`}
              >
                {f.label}
                <span className={`ml-1 ${active ? "text-white/70" : "text-[var(--gray-500)]"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--gray-500)] text-center py-10">
          평가단원이 아직 없습니다.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--gray-500)] text-center py-10">조건에 맞는 인원이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                <th className="px-4 py-2 font-semibold">학생</th>
                <th className="px-4 py-2 font-semibold">계좌</th>
                <th className="px-4 py-2 font-semibold">주민번호</th>
                <th className="px-4 py-2 font-semibold">미지급</th>
                <th className="px-4 py-2 font-semibold text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.userId}>
                  <tr className="border-t border-[var(--gray-100)] hover:bg-[var(--gray-50)] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[var(--foreground)] font-medium">{r.name}</span>
                        <span className="text-xs text-[var(--gray-500)]">{r.studentId}</span>
                        {r.byAdmin && <Badge tone="warning">대리입력</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.payoutReady ? (
                        <div className="leading-tight">
                          <span className="text-[var(--muted)]">
                            {r.bankName} {r.accountNumber}
                          </span>
                          {/* 예금주가 본인 이름과 다르면 표시 */}
                          {r.holderName && r.holderName !== r.name && (
                            <div className="text-xs text-[var(--warning)]">
                              예금주 {r.holderName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge tone="danger">미입력</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.hasRrn ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[var(--muted)]">{r.rrnMasked}</span>
                          {/* 본인 동의 기록이 없는 건(본인 확인 필요) */}
                          {!r.consented && <Badge tone="warning">동의 미확인</Badge>}
                        </span>
                      ) : (
                        <span className="text-[var(--gray-500)]">없음</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--muted)]">
                      {r.pendingRewards > 0 ? (
                        <span className={r.payoutReady ? "" : "text-[var(--danger)] font-medium"}>
                          {r.pendingRewards}건
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(editing === r.userId ? null : r.userId)}
                          className={BTN_GHOST}
                          title="등록 정보 확인 · 관리자가 대신 입력"
                        >
                          <Icon d={editing === r.userId ? I_CLOSE : I_EDIT} />
                          {editing === r.userId ? "닫기" : "보기 · 입력"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {editing === r.userId && (
                    <tr className="border-t border-[var(--gray-100)] bg-[var(--surface)]">
                      <td colSpan={5} className="px-4 py-3 space-y-3">
                        {/* 현재 등록된 값(주소·수정 시각 포함) */}
                        <div>
                          <p className="text-xs font-semibold text-[var(--muted)] mb-1.5">
                            현재 등록 정보
                          </p>
                          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                            <Field label="은행" value={r.bankName} />
                            <Field label="계좌번호" value={r.accountNumber} />
                            <Field label="예금주" value={r.holderName} fallback={`${r.name} (본인)`} />
                            <Field label="주소" value={r.address} />
                            <Field label="주민번호" value={r.hasRrn ? r.rrnMasked : ""} />
                            <Field label="최종 수정" value={r.updatedAt} />
                            <Field
                              label="본인 동의"
                              value={r.consentedAt}
                              fallback={r.hasRrn ? "미확인" : "해당 없음"}
                            />
                          </dl>
                          {r.hasRrn && (
                            <p className="text-xs text-[var(--gray-500)] mt-1.5">
                              주민번호 전체는 화면에 표시하지 않습니다. 신고용 전체 값은 발주별
                              &quot;원천징수 명세&quot; 내려받기로 확인하세요.
                            </p>
                          )}
                        </div>

                        <form
                          action={saveSettlementProfileForUserAction}
                          className="space-y-2 pt-3 border-t border-[var(--gray-200)]"
                        >
                          <input type="hidden" name="userId" value={r.userId} />
                          <p className="text-xs font-semibold text-[var(--muted)]">
                            대신 입력
                          </p>
                          <p className="text-xs text-[var(--warning)]">
                            본인에게 확인받은 정보만 입력하세요. 누가 언제 대신 입력했는지 기록되고,
                            학생 화면에는 본인 확인 요청이 표시됩니다.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input
                              name="bankName"
                              list="admin-banks"
                              defaultValue={r.bankName}
                              placeholder="은행"
                              className={INPUT}
                              required
                            />
                            <input
                              name="accountNumber"
                              defaultValue={r.accountNumber}
                              placeholder="계좌번호"
                              inputMode="numeric"
                              className={INPUT}
                              required
                            />
                            <input
                              name="holderName"
                              defaultValue={r.holderName}
                              placeholder="예금주 (본인과 다를 때만)"
                              className={INPUT}
                            />
                            <input
                              name="address"
                              defaultValue={r.address}
                              placeholder="주소 (지급명세서용)"
                              className={INPUT}
                            />
                            <input
                              name="rrn"
                              placeholder={r.hasRrn ? `주민번호 ${r.rrnMasked} (변경 시)` : "주민번호 13자리"}
                              inputMode="numeric"
                              className={INPUT}
                            />
                          </div>
                          <SubmitButton className={BTN_PRIMARY}>저장</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <datalist id="admin-banks">
            {BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      )}
    </section>
  );
}

function Field({ label, value, fallback = "-" }: { label: string; value: string; fallback?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--gray-500)]">{label}</dt>
      <dd className={`truncate ${value ? "text-[var(--foreground)]" : "text-[var(--gray-500)]"}`}>
        {value || fallback}
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--gray-200)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${warn ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--gray-500)] mt-0.5">{sub}</p>
    </div>
  );
}

const BADGE_TONE = {
  warning: "bg-[var(--warning-light)] text-[var(--warning)]",
  danger: "bg-[var(--danger-light)] text-[var(--danger)]",
} as const;

function Badge({ tone, children }: { tone: keyof typeof BADGE_TONE; children: React.ReactNode }) {
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  );
}
