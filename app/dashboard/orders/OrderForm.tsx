"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import { useState } from "react";
import Link from "next/link";
import { createOrderAction } from "./actions";
import BizFields from "./BizFields";
import { computeAmountsFromSubtotal, won } from "../../lib/money";
import { TIME_TIERS, DEFAULT_TIER, tierOf } from "../../lib/quoteTiers";

/**
 * 발주·견적서 폼. 필요한 입력이 같아서 한 폼에 버튼 두 개를 둠
 *
 * 견적서 버튼은 formAction/formMethod/formTarget 으로 GET /api/orders/quote 를 새 탭에 열기
 * React 는 submitter 의 formAction 이 문자열이면 브라우저 기본 동작에 맡김
 * Enter 는 첫 번째 submit 버튼을 누르므로 발주 버튼을 먼저 둠
 * 견적서에는 세금계산서 이메일이 필요 없어 formNoValidate 를 줌
 */

export interface OrderFormService {
  id: string;
  name: string;
}

export default function OrderForm({
  services,
  biz,
  feeRateBp,
  allowFeeRate = false,
}: {
  services: OrderFormService[];
  biz: { bizNo: string; bizName: string; bizCeo: string; bizAddr: string; bizEmail: string };
  feeRateBp: number;
  /** 수수료율 변경은 ADMIN 만(서버에서도 확인함) */
  allowFeeRate?: boolean;
}) {
  const [panelSize, setPanelSize] = useState("10");
  const [rewardPerPerson, setRewardPerPerson] = useState("30000");
  const [feeRate, setFeeRate] = useState(String(feeRateBp));
  /**
   * 추가 회차(첫 줄 뒤에 붙음). 회차마다 단가·인원이 다를 때 견적서에 씀
   * Order 는 단가·인원 한 쌍만 저장하므로 추가 회차가 있으면 발주 버튼을 잠금
   */
  const [extra, setExtra] = useState<
    { label: string; tier: string; qty: string; rounds: string; unit: string }[]
  >([]);
  /** 첫 줄의 소요시간 구간. 단가 하한을 정함 */
  const [tier, setTier] = useState(DEFAULT_TIER.key);
  /** 빈 문자열은 "직접 입력"(서비스 미등록). 이때는 견적서만 낼 수 있음(Order.serviceId 필수). */
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [serviceName, setServiceName] = useState("");
  /** 납기. 견적서에만 쓰이고 발주에는 저장하지 않음(Order 에 해당 컬럼이 없음). */
  const [deliveryTerm, setDeliveryTerm] = useState("");

  const n = Number.parseInt(panelSize, 10) || 0;
  const r = Number.parseInt(rewardPerPerson, 10) || 0;
  // ADMIN 이 아니면 기본 수수료율(서버도 폼 값을 무시함)
  const fee = allowFeeRate ? (Number.parseInt(feeRate, 10) || 0) : feeRateBp;

  const validExtra = extra
    .map((e) => ({
      label: e.label,
      tier: e.tier,
      qty: Number.parseInt(e.qty, 10) || 0,
      rounds: Number.parseInt(e.rounds, 10) || 1,
      unit: Number.parseInt(e.unit, 10) || 0,
    }))
    .filter((e) => e.qty > 0 && e.unit > 0);
  const multi = validExtra.length > 0;

  const ready = n > 0 && r > 0;
  const subtotal = n * r + validExtra.reduce((s, e) => s + e.qty * e.rounds * e.unit, 0);
  // 미리보기도 서버와 같은 함수로 계산함
  const amounts = computeAmountsFromSubtotal(subtotal, fee);
  const totalPeople = n + validExtra.reduce((s, e) => s + e.qty * e.rounds, 0);
  // 단가가 하한보다 낮으면 알려줌(서버도 하한을 적용함).
  const floorHit = r > 0 && r < tierOf(tier).floor;
  /**
   * 단가에 비해 소요시간 구간이 낮게 선택된 것 같으면 알려줌
   * 소요시간은 금액에는 영향이 없지만 견적서에 그대로 찍히므로 확인을 권함(막지는 않음).
   */
  const impliedTier = r > 0 ? [...TIME_TIERS].reverse().find((t) => r >= t.floor) : undefined;
  const tierMismatch = impliedTier && impliedTier.key !== tier ? impliedTier : null;
  /** 견적서만 가능한 상태(추가 회차가 있거나 서비스를 직접 입력한 경우) */
  const orderBlocked = multi || !serviceId;

  const box = "w-full px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]";

  return (
    <form action={createOrderAction} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--muted)] mb-1">
          평가 대상 서비스
        </label>
        <select
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className={box}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {/* 서비스를 등록하지 않은 곳에 견적을 낼 때 씀 */}
          <option value="">직접 입력 (견적서 전용)</option>
        </select>
      </div>

      {!serviceId && (
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">평가명</label>
          <input
            name="serviceName"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder="예: 개인화 챗봇 테스트"
            className={box}
          />
          <p className="text-xs text-[var(--gray-500)] mt-0.5">
            견적서 품목명에 쓰입니다. 비우면 &quot;AI 평가&quot;로 나갑니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">소요시간</label>
          <select
            name="itemTier"
            value={tier}
            onChange={(e) => {
              setTier(e.target.value);
              // 구간을 바꾸면 단가를 그 구간의 하한으로 맞춤
              setRewardPerPerson(String(tierOf(e.target.value).floor));
            }}
            className={box}
          >
            {TIME_TIERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            모집 인원{multi && " (1회차)"}
          </label>
          <input
            name="panelSize"
            type="number"
            min={1}
            max={500}
            value={panelSize}
            onChange={(e) => setPanelSize(e.target.value)}
            required
            className={box}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            1인당 보상 (원){multi && " (1회차)"}
          </label>
          {/* step 을 두지 않음. 견적서 버튼은 검증을 건너뛰어 발주와 허용 금액이 달라지기 때문임
              하한은 enforceFloor 가 적용함 */}
          <input
            name="rewardPerPerson"
            type="number"
            min={tierOf(tier).floor}
            max={1000000}
            value={rewardPerPerson}
            onChange={(e) => setRewardPerPerson(e.target.value)}
            required
            className={box}
          />
          <p className="text-xs text-[var(--gray-500)] mt-0.5">
            최저 {tierOf(tier).floor.toLocaleString("ko-KR")}원
          </p>
        </div>
        <div className="w-9" />
      </div>

      {floorHit && (
        <p className="text-xs text-[var(--warning)]">
          단가가 최저단가({tierOf(tier).floor.toLocaleString("ko-KR")}원)보다 낮습니다. 견적서에는 최저단가로 올려서 계산됩니다.
        </p>
      )}

      {tierMismatch && (
        <p className="text-xs text-[var(--muted)] bg-[var(--gray-50)] px-3 py-2 rounded-[var(--radius-md)] leading-relaxed">
          소요시간이 <strong>「{tierOf(tier).label}」</strong>로 선택돼 있습니다. 단가(
          {r.toLocaleString("ko-KR")}원)는 <strong>「{tierMismatch.label}」</strong> 구간에
          해당합니다. <strong>견적서에 선택한 구간이 그대로 찍히니</strong> 실제 소요시간이
          맞는지 확인하세요. (금액에는 영향이 없습니다)
        </p>
      )}

      {/* 납기(견적서 특기사항). 비우면 견적서에서 줄을 생략함. 기본값은 넣지 않음 */}
      <div>
        <label className="block text-xs font-medium text-[var(--muted)] mb-1">
          납기 / 이행 기간 <span className="text-[var(--gray-500)] font-normal">(선택)</span>
        </label>
        <input
          name="deliveryTerm"
          value={deliveryTerm}
          onChange={(e) => setDeliveryTerm(e.target.value)}
          placeholder="예: 평가자 모집 완료 후 4주 이내"
          className={box}
        />
        <p className="text-xs text-[var(--gray-500)] mt-0.5 leading-snug">
          견적서 「견적 조건」에 찍힙니다. 비우면 표시되지 않습니다.
          <br />
          일정이 유동적이면 확정 날짜 대신 <strong>&quot;모집 완료 후 N주&quot;</strong> 같은
          조건부 기한을 쓰세요. 비워두면 상대가 요청하는 즉시 이행 의무가 생깁니다(민법
          제387조 제2항).
        </p>
      </div>

      {/* 첫 줄도 견적서 쿼리에 실음(라우트가 item* 을 getAll 로 짝지어 읽음).
          itemLabel 은 비워 보내면 라우트가 「서비스명 평가 · N회차」로 채움 */}
      <input type="hidden" name="itemLabel" value="" />
      <input type="hidden" name="itemQty" value={panelSize} />
      <input type="hidden" name="itemRounds" value="1" />
      <input type="hidden" name="itemUnit" value={rewardPerPerson} />

      {extra.map((e, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input
              name="itemLabel"
              value={e.label}
              onChange={(ev) =>
                setExtra((v) => v.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))
              }
              placeholder={`${i + 2}회차`}
              className={box}
            />
            <select
              name="itemTier"
              value={e.tier}
              onChange={(ev) =>
                setExtra((v) =>
                  v.map((x, j) =>
                    j === i
                      ? { ...x, tier: ev.target.value, unit: String(tierOf(ev.target.value).floor) }
                      : x,
                  ),
                )
              }
              className={box}
            >
              {TIME_TIERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              name="itemUnit"
              type="number"
              min={tierOf(e.tier).floor}
              max={1000000}
              value={e.unit}
              onChange={(ev) =>
                setExtra((v) => v.map((x, j) => (j === i ? { ...x, unit: ev.target.value } : x)))
              }
              placeholder="1인당 보상"
              className={box}
            />
            <input
              name="itemQty"
              type="number"
              min={1}
              max={500}
              value={e.qty}
              onChange={(ev) =>
                setExtra((v) => v.map((x, j) => (j === i ? { ...x, qty: ev.target.value } : x)))
              }
              placeholder="인원"
              className={box}
            />
            <input
              name="itemRounds"
              type="number"
              min={1}
              max={100}
              value={e.rounds}
              onChange={(ev) =>
                setExtra((v) => v.map((x, j) => (j === i ? { ...x, rounds: ev.target.value } : x)))
              }
              placeholder="회차 수"
              className={box}
            />
          </div>
          <button
            type="button"
            onClick={() => setExtra((v) => v.filter((_, j) => j !== i))}
            aria-label="회차 삭제"
            className="w-9 h-9 shrink-0 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--muted)] hover:bg-[var(--gray-50)]"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setExtra((v) => [
            ...v,
            { label: "", tier: DEFAULT_TIER.key, qty: "", rounds: "1", unit: String(DEFAULT_TIER.floor) },
          ])
        }
        className="text-xs font-medium text-[var(--accent)] hover:underline"
      >
        + 회차 추가 (소요시간별 단가가 다를 때)
      </button>

      {/* 수수료율(ADMIN 전용). 견적서와 발주가 같은 값을 쓰도록 폼 안에 둠 */}
      {allowFeeRate && (
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            플랫폼 수수료율 (bp)
            <span className="text-[var(--gray-500)] font-normal">
              {" "}
              — 100 bp = 1% · 기본 {feeRateBp} bp ({feeRateBp / 100}%)
            </span>
          </label>
          <input
            name="feeRateBp"
            type="number"
            min={0}
            max={10000}
            step={10}
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            className={box}
          />
        </div>
      )}

      {/* 기업 정보(견적서 공급받는자와 세금계산서 공용) */}
      <div className="pt-2 border-t border-[var(--gray-100)]">
        <p className="text-xs font-medium text-[var(--foreground)] mb-2">
          기업 정보
          <span className="text-[var(--muted)] font-normal">
            {" "}
            — 견적서와 세금계산서에 함께 쓰입니다. 입금 확인 시 전자세금계산서가 자동 발행됩니다
          </span>
        </p>
        <BizFields initial={biz} />
      </div>

      {ready && (
        <div className="p-3 bg-[var(--gray-50)] rounded-[var(--radius-md)] text-xs text-[var(--muted)] space-y-1">
          <div className="flex justify-between">
            <span>
              {multi ? "1회차" : "참여 보상"} ({n}명 × {r.toLocaleString("ko-KR")}원)
            </span>
            <span>{won(n * r)}</span>
          </div>
          {validExtra.map((e, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {e.label || `${i + 2}회차`} ({e.qty}명 × {e.unit.toLocaleString("ko-KR")}원
                {e.rounds > 1 ? ` × ${e.rounds}회차` : ""})
              </span>
              <span>{won(e.qty * e.rounds * e.unit)}</span>
            </div>
          ))}
          {multi && (
            <div className="flex justify-between pt-1 border-t border-[var(--gray-200)]">
              <span>보상 소계 (총 {totalPeople}명)</span>
              <span>{won(amounts.subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>플랫폼 수수료 ({fee / 100}%)</span>
            <span>{won(amounts.fee)}</span>
          </div>
          <div className="flex justify-between">
            <span>부가세 (10%)</span>
            <span>{won(amounts.vat)}</span>
          </div>
          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-[var(--gray-200)] text-sm font-bold text-[var(--foreground)]">
            <span>합계</span>
            <span>{won(amounts.totalAmount)}</span>
          </div>
        </div>
      )}

      {/* 견적서만 가능한 경우 안내: 추가 회차가 있거나 서비스를 직접 입력한 경우 */}
      {multi && (
        <p className="text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
          회차가 여러 개면 <strong>견적서만</strong> 발급됩니다. 의뢰는 한 가지 단가만
          저장하므로, 합계만 맞춰 의뢰하면 학생별 보상액이 어긋납니다.
          <br />
          <strong>회차별로 나눠 의뢰</strong>하거나, 사람마다 참여시간이 다른 경우에는
          대표 단가로 의뢰한 뒤 <strong>정산 화면의 검수 단계에서 개인별 금액을 조정</strong>
          하세요 (승인 전까지 가능하며, 청구액과의 차액이 화면에 표시됩니다).
        </p>
      )}
      {!serviceId && (
        <p className="text-xs text-[var(--warning)] bg-[var(--warning-light)] px-3 py-2.5 rounded-[var(--radius-md)] leading-relaxed">
          서비스를 직접 입력하면 <strong>견적서만</strong> 발급됩니다. 의뢰하려면 먼저{" "}
          <Link href="/dashboard/services" className="underline">
            서비스를 등록
          </Link>
          해야 합니다.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <ConfirmButton
          message={`합계 ${won(amounts.totalAmount)}(부가세 포함)으로 평가를 의뢰합니다.\n\n· 의뢰서가 만들어지고 입금 안내가 나갑니다. 견적서와 달리 실제 거래가 시작됩니다.\n· 세금계산서는 입력한 사업자 정보로 발행되니 상호·사업자번호를 다시 확인하세요.\n\n정말 의뢰하시겠습니까?`}
          disabled={orderBlocked}
          title={orderBlocked ? "지금 조건에서는 견적서만 발급할 수 있습니다" : undefined}
          className="px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          의뢰하고 입금 안내 받기
        </ConfirmButton>
        <button
          type="submit"
          formAction="/api/orders/quote"
          formMethod="get"
          formTarget="_blank"
          formNoValidate
          disabled={!ready}
          className="px-4 py-2 text-sm font-medium border border-[var(--gray-300)] text-[var(--foreground)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          견적서 PDF 받기
        </button>
        <span className="text-xs text-[var(--gray-500)]">
          견적서는 새 탭에서 열립니다 · 유효기간 30일 · <strong>의뢰는 생성되지 않습니다</strong>
        </span>
      </div>
    </form>
  );
}
