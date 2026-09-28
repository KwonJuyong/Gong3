"use client";

import { useState } from "react";

/**
 * [ADMIN] 원장 내역(통장 대사용). 잔액 열은 그 줄까지의 누적 잔액이다. 기본은 접혀 있다.
 */

export interface LedgerRowView {
  id: string;
  kind: string;
  amount: number;
  liability: number;
  memo: string;
  /** 서버에서 포맷한 문자열 (Date 를 클라이언트로 넘기지 않는다) */
  occurredAt: string;
  orderNo: string;
  balance: number;
}

/** 원장 종류별 라벨과 색 */
const KIND: Record<string, { text: string; cls: string }> = {
  PAYMENT_IN: { text: "수납", cls: "text-[var(--success)]" },
  PAYMENT_REFUND: { text: "환불", cls: "text-[var(--danger)]" },
  PAYOUT_OUT: { text: "보상 지급", cls: "text-[var(--danger)]" },
  TAX_WITHHELD: { text: "원천징수 적립", cls: "text-[var(--warning)]" },
  TAX_REMITTED: { text: "원천세 납부", cls: "text-[var(--muted)]" },
  VAT_COLLECTED: { text: "부가세 수취", cls: "text-[var(--warning)]" },
  VAT_REFUNDED: { text: "부가세 환급분", cls: "text-[var(--muted)]" },
  VAT_INPUT: { text: "매입세액 공제", cls: "text-[var(--muted)]" },
  VAT_REMITTED: { text: "부가세 납부", cls: "text-[var(--muted)]" },
};

const won = (n: number) => (n === 0 ? "—" : (n < 0 ? "−₩" : "₩") + Math.abs(n).toLocaleString("ko-KR"));

const TH = "px-3 py-1.5 font-semibold";
const TD = "px-3 py-1.5";

export default function LedgerPanel({ rows }: { rows: LedgerRowView[] }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white rounded-[var(--radius-xl)] overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">원장 내역</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            모든 금액의 근거. 통장 거래내역과 대사한다. 최근 {rows.length}건.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 text-xs font-medium border border-[var(--gray-300)] text-[var(--muted)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] transition-colors shrink-0"
        >
          {open ? "닫기" : "원장 열기"}
        </button>
      </div>

      {open &&
        (rows.length === 0 ? (
          <p className="text-sm text-[var(--gray-500)] text-center py-8 border-t border-[var(--gray-100)]">
            원장 기록이 없다. 첫 수납이 확인되면 여기에 쌓인다.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--gray-100)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-xs text-[var(--gray-500)] bg-[var(--gray-50)]">
                  <th className={TH}>일시</th>
                  <th className={TH}>종류</th>
                  <th className={`${TH} text-right`}>현금</th>
                  <th className={`${TH} text-right`}>부채</th>
                  <th className={`${TH} text-right`}>잔액</th>
                  <th className={TH}>발주</th>
                  <th className={TH}>메모</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const k = KIND[r.kind] ?? { text: r.kind, cls: "text-[var(--muted)]" };
                  return (
                    <tr key={r.id} className="border-t border-[var(--gray-100)]">
                      <td className={`${TD} text-[var(--gray-500)] whitespace-nowrap`}>
                        {r.occurredAt}
                      </td>
                      <td className={`${TD} font-medium whitespace-nowrap ${k.cls}`}>{k.text}</td>
                      <td className={`${TD} text-right tabular-nums text-[var(--foreground)]`}>
                        {won(r.amount)}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-[var(--muted)]`}>
                        {won(r.liability)}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-medium text-[var(--foreground)]`}>
                        ₩{r.balance.toLocaleString("ko-KR")}
                      </td>
                      <td className={`${TD} text-[var(--gray-500)] whitespace-nowrap`}>
                        {r.orderNo || "—"}
                      </td>
                      <td className={`${TD} text-[var(--muted)]`}>{r.memo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-[var(--gray-500)] px-3 py-2">
              ※ 원장은 append-only 다. 취소·환불도 줄을 고치지 않고 반대 부호 줄을 새로 쌓는다.
              부채 열은 원천징수·부가세처럼 받아뒀지만 우리 돈이 아닌 금액이다.
            </p>
          </div>
        ))}
    </section>
  );
}
