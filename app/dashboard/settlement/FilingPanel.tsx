"use client";

import SubmitButton from "@/app/components/SubmitButton";
import ConfirmButton from "@/app/components/ConfirmButton";
import { useState } from "react";
import { recordTaxFilingAction, deleteTaxFilingAction } from "./actions";

/**
 * 세무 신고 기록(그 달에 무엇을 신고했는가).
 * 수정신고가 있어 기록은 고칠 수 있음. 현재 집계와 다르면 표시만 하고 자동으로 덮어쓰지 않음
 */

export interface FilingRowView {
  kind: string;
  label: string;
  where: string;
  due: string; // ISO
  overdue: boolean;
  filed: {
    id: string;
    status: string;
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
    receiptNo: string | null;
    memo: string | null;
    filedAt: string;
    amendedAt: string | null;
  } | null;
  drift: string | null;
}

export interface FilingPanelProps {
  year: number;
  month: number;
  current: {
    headcount: number;
    entryCount: number;
    grossAmount: number;
    incomeTax: number;
    localTax: number;
  };
  rows: FilingRowView[];
}

import { won } from "../../lib/money";
const dstr = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));

export default function FilingPanel({ year, month, current, rows }: FilingPanelProps) {
  const [openKind, setOpenKind] = useState<string | null>(null);

  const box =
    "w-full px-2 py-1.5 text-xs border border-[var(--gray-200)] rounded-[var(--radius-md)]";

  return (
    <section className="bg-white rounded-[var(--radius-xl)] p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          세무 신고 기록: {year}년 {month}월 지급분
        </h3>
        <span className="text-xs text-[var(--muted)]">
          현재 집계 {current.headcount}명 · {current.entryCount}건 · {won(current.grossAmount)}
        </span>
      </div>
      <p className="text-xs text-[var(--gray-500)] mt-1 leading-relaxed">
        신고는 자동화할 수 없습니다. <strong>낸 것을 여기 남겨야</strong> 다음 달에·다른 PC에서
        무엇을 했는지 알 수 있고, 기한 알림도 멈춥니다.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((r) => {
          const open = openKind === r.kind;
          const f = r.filed;
          return (
            <div
              key={r.kind}
              className="rounded-[var(--radius-md)] border border-[var(--gray-200)] px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--foreground)]">
                    {f ? "✓ " : ""}
                    {r.label}
                    <span className="text-[var(--muted)] font-normal"> · {r.where}</span>
                    {f?.status === "NOT_REQUIRED" && (
                      <span className="text-[var(--muted)] font-normal"> · 해당없음</span>
                    )}
                    {f?.amendedAt && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-[var(--gray-100)] text-[var(--muted)]">
                        수정신고
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    기한 {dstr(r.due)}
                    {f ? (
                      <>
                        {" · "}
                        {f.status === "FILED"
                          ? `${f.headcount}명 · ${won(f.grossAmount)}`
                          : "낼 것 없음"}
                        {f.receiptNo && ` · 접수 ${f.receiptNo}`}
                      </>
                    ) : r.overdue ? (
                      <span className="text-[var(--warning)] font-medium"> · 기한 경과, 미기록</span>
                    ) : (
                      " · 미기록"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenKind(open ? null : r.kind)}
                    className="px-2.5 py-1.5 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)]"
                  >
                    {open ? "닫기" : f ? "수정" : "신고 기록"}
                  </button>
                  {f && (
                    <form action={deleteTaxFilingAction}>
                      <input type="hidden" name="filingId" value={f.id} />
                      <ConfirmButton
                        message={"이 신고 기록을 삭제합니다.\n\n· 홈택스·위택스에 낸 신고는 그대로이고, 이 화면의 기록만 지워집니다.\n· 지우면 이 달이 「미신고」로 돌아가 리마인더가 다시 옵니다.\n\n정말 삭제하시겠습니까?"}
                        className="px-2.5 py-1.5 text-xs font-medium text-[var(--warning)] rounded-[var(--radius-md)] hover:bg-[var(--warning-light)]"
                      >
                        기록 삭제
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              {r.drift && (
                <p className="mt-2 text-xs text-[var(--warning)] bg-[var(--warning-light)] px-2.5 py-2 rounded-[var(--radius-md)] leading-relaxed">
                  <strong>신고 후 이 달 지급이 바뀌었습니다.</strong> {r.drift}
                  <br />
                  홈택스에서 <strong>수정신고</strong>한 뒤 아래 「수정」으로 값을 맞추세요.
                  고치지 않았다면 그대로 두세요. 기록은 <strong>실제로 낸 값</strong>이어야 합니다.
                </p>
              )}

              {open && (
                <form action={recordTaxFilingAction} className="mt-2.5 space-y-2">
                  <input type="hidden" name="kind" value={r.kind} />
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="month" value={month} />

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { name: "headcount", label: "인원", def: f?.headcount ?? current.headcount },
                      {
                        name: "entryCount",
                        label: "지급건수",
                        def: f?.entryCount ?? current.entryCount,
                      },
                      {
                        name: "grossAmount",
                        label: "지급액",
                        def: f?.grossAmount ?? current.grossAmount,
                      },
                      { name: "incomeTax", label: "소득세", def: f?.incomeTax ?? current.incomeTax },
                      { name: "localTax", label: "지방세", def: f?.localTax ?? current.localTax },
                    ].map((c) => (
                      <label key={c.name} className="block">
                        <span className="text-xs text-[var(--muted)]">{c.label}</span>
                        <input
                          name={c.name}
                          type="number"
                          min={0}
                          defaultValue={c.def}
                          className={box}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-xs text-[var(--muted)]">홈택스 접수번호 (선택)</span>
                      <input name="receiptNo" defaultValue={f?.receiptNo ?? ""} className={box} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs text-[var(--muted)]">메모 (선택)</span>
                      <input
                        name="memo"
                        defaultValue={f?.memo ?? ""}
                        placeholder="예: 기한후신고 · 수정 사유"
                        className={box}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      <input
                        type="checkbox"
                        name="status"
                        value="NOT_REQUIRED"
                        defaultChecked={f?.status === "NOT_REQUIRED"}
                      />
                      이 달은 낼 것이 없음 (지급 0건)
                    </label>
                    <SubmitButton className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)]">
                      {f ? "수정 저장" : "신고 완료로 기록"}
                    </SubmitButton>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--gray-500)] mt-3 leading-relaxed">
        <strong>세액이 0원이어도 신고·제출 대상</strong>입니다. 평가 보상은 일시적 인적용역
        (소득세법 제21조 제1항 제19호)이라 과세최저한 제출면제의 예외입니다.
        <br />원천세(홈택스)와 지방소득세(위택스)는 <strong>별개 신고</strong>라 따로
        기록합니다. 홈택스만 내고 위택스를 잊는 게 가장 흔한 사고입니다.
      </p>
    </section>
  );
}
