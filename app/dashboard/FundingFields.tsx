"use client";

import Link from "next/link";

/**
 * 비용 처리 선택(동행 평가·표준 설문·자유 설문 공용). 평가 방식과는 별개 축
 * 공개 여부와는 무관하고 보상을 사전에 마련할지(기업 의뢰) 사후 정산할지(교육기관·연구비)만 정함
 */
const FUNDING_OPTIONS = [
  {
    value: "COMPANY",
    label: "외부 의뢰형: 기업",
    hint: "기업이 평가 의뢰를 내고 입금해요(선불). 학생 참여 보상은 플랫폼이 지급해요.",
  },
  {
    value: "UNIVERSITY",
    label: "외부 의뢰형: 교육기관 계약",
    hint: "교육기관과 계약해 진행하고 대금은 검수 후에 받아요(후불). 학생 참여 보상은 플랫폼이 먼저 지급해요.",
  },
  {
    value: "RESEARCH_FUND",
    label: "연구과제형: 연구비",
    hint: "연구과제 예산으로 진행해 평가 의뢰가 필요 없어요. 평가가 끝난 뒤 노무비로 청구하고 산학협력단이 지급해요.",
  },
];

export type LinkableOrder = {
  id: string;
  orderNo: string;
  serviceName: string;
  panelSize: number;
  rewardPerPerson: number;
  paid: boolean;
};

export default function FundingFields({
  value,
  onChange,
  orders,
}: {
  value: string;
  onChange: (v: string) => void;
  orders: LinkableOrder[];
}) {
  const opt = FUNDING_OPTIONS.find((o) => o.value === value) ?? FUNDING_OPTIONS[0];
  const needsOrder = value === "COMPANY" || value === "UNIVERSITY";
  const box =
    "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";
  return (
    <fieldset className="space-y-2">
      <legend className="text-base font-bold">비용 처리</legend>
      <p className="text-xs text-[var(--muted)]">평가 방식과 관계없이 학생 참여 보상을 어떻게 마련·정산할지 정해요. 기업 의뢰는 입금으로 미리 마련하고, 교육기관 계약·연구비는 평가 뒤에 정산해요.</p>
      <label htmlFor="funding-type" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5 pt-1">
        비용 처리 방식
      </label>
      <select
        id="funding-type"
        name="fundingType"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={box}
      >
        {FUNDING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-[var(--muted)] leading-relaxed">{opt.hint}</p>

      {value === "UNIVERSITY" && (
        <input name="contractRef" placeholder="계약번호 (선택)" aria-label="계약번호" className={box} />
      )}
      {value === "RESEARCH_FUND" && (
        <input name="fundRef" placeholder="과제번호 (선택)" aria-label="과제번호" className={box} />
      )}

      {/* 발주는 나중에 연결할 수 있음. 연결 전에는 보상이 생기지 않음 */}
      {needsOrder &&
        (orders.length > 0 ? (
          <div>
            <label htmlFor="link-order" className="block text-xs font-medium text-[var(--gray-700)] mb-1.5">
              연결할 평가 의뢰 <span className="text-[var(--muted)] font-normal">(선택)</span>
            </label>
            <select id="link-order" name="orderId" className={box} defaultValue="">
              <option value="">선택 안 함 (나중에 연결)</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNo} · {o.serviceName} · {o.panelSize}명 ×{" "}
                  {o.rewardPerPerson.toLocaleString("ko-KR")}원{o.paid ? " · 입금완료" : " · 입금대기"}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
              의뢰의 인원·단가가 이 평가의 <strong>정원과 보상</strong>이 돼요. 지금 고르지
              않아도 의뢰 화면에서 <strong>나중에 연결</strong>할 수 있고, 그때까지 참여한 학생 보상도 생겨요.
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
            연결할 평가 의뢰가 아직 없어요. 평가는 <strong>승인되면 공개</strong>되지만, 학생 참여 보상은
            의뢰를 연결해야 생겨요. {" "}
            <Link href="/dashboard/orders" className="underline font-semibold">
              평가 의뢰
            </Link>
            를 낸 뒤 의뢰 화면에서 이 평가에 연결해도 돼요.
          </p>
        ))}
    </fieldset>
  );
}
