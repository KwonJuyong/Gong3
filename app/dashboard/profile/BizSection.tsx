"use client";


import SubmitButton from "@/app/components/SubmitButton";
import { useState, useTransition } from "react";
import { lookupBizAction } from "../orders/actions";
import { saveMyBizProfileAction } from "./actions";
import { Card, Field, Note, Badge, INPUT, BTN_PRIMARY, BTN_GHOST } from "./ui";

/**
 * 기업 정보. 발주 폼·견적서·세금계산서의 공급받는자 정보를 여기 값으로 채운다.
 * 사업자번호 조회에 실패하면 직접 입력한다(이메일은 항상 직접 입력).
 */
export default function BizSection({
  initial,
}: {
  initial: {
    bizNo: string;
    bizName: string;
    bizCeo: string;
    bizAddr: string;
    bizEmail: string;
    invoiceReady: boolean;
    /** 발주 권한 확인 시각(체크는 저장할 때마다 다시 받는다) */
    attestedAt: string | null;
    /** 사업자 상태 조회 결과. null 은 아직 확인하지 못한 것(미등록과 다르다). */
    bizState: string | null;
  };
}) {
  const [bizNo, setBizNo] = useState(initial.bizNo);
  const [bizName, setBizName] = useState(initial.bizName);
  const [bizCeo, setBizCeo] = useState(initial.bizCeo);
  const [bizAddr, setBizAddr] = useState(initial.bizAddr);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const lookup = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await lookupBizAction(bizNo);
      if (r.ok) {
        setBizName(r.corpName ?? "");
        setBizCeo(r.ceoName ?? "");
        setBizAddr(r.addr ?? "");
        setMsg({ ok: true, text: "국세청에 등록된 회사 정보를 불러왔습니다." });
      } else {
        setMsg({ ok: false, text: r.error ?? "조회에 실패했습니다. 직접 입력해 주세요." });
      }
    });
  };

  return (
    <form action={saveMyBizProfileAction} className="space-y-5">
      <Card
        title="기업 정보"
        desc="평가 발주 시 견적서와 전자세금계산서에 그대로 쓰입니다. 여기에 저장해두면 발주할 때마다 다시 입력하지 않아도 됩니다."
        aside={
          initial.invoiceReady ? (
            <Badge tone="success">발주 가능</Badge>
          ) : (
            <Badge tone="warning">미완성</Badge>
          )
        }
      >
        <div className="space-y-4">
          {!initial.invoiceReady && (
            <Note tone="warning">
              사업자등록번호·상호·세금계산서 수신 이메일이 모두 있어야 발주할 수 있습니다.
            </Note>
          )}

          {/* 사업자 상태 조회 결과(정상·휴업·미확인). 미등록·폐업은 저장 단계에서 막힌다. */}
          {initial.bizNo &&
            (initial.bizState ? (
              <Note tone={initial.bizState === "정상" ? "success" : "warning"}>
                국세청 조회 결과: <strong>{initial.bizState}</strong>
              </Note>
            ) : (
              <Note tone="muted">
                국세청 조회를 아직 못 했습니다(조회 서비스 미설정 또는 일시 오류). 발주는
                가능하지만, 발주 시점에 다시 확인합니다.
              </Note>
            ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="사업자등록번호" hint="10자리를 넣고 조회하면 상호·대표자·주소가 채워집니다.">
              <div className="flex gap-2">
                <input
                  name="bizNo"
                  value={bizNo}
                  onChange={(e) => setBizNo(e.target.value)}
                  required
                  placeholder="1234567890"
                  inputMode="numeric"
                  className={`flex-1 min-w-0 ${INPUT}`}
                />
                <button
                  type="button"
                  onClick={lookup}
                  disabled={pending}
                  className={`shrink-0 ${BTN_GHOST}`}
                >
                  {pending ? "조회 중" : "조회"}
                </button>
              </div>
            </Field>

            <Field label="상호">
              <input
                name="bizName"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                required
                placeholder="(주)회사명"
                className={INPUT}
              />
            </Field>

            <Field label="대표자명">
              <input
                name="bizCeo"
                value={bizCeo}
                onChange={(e) => setBizCeo(e.target.value)}
                placeholder="대표자명"
                className={INPUT}
              />
            </Field>

            <Field label="세금계산서 수신 이메일" hint="발행된 계산서가 이 주소로 갑니다.">
              <input
                name="bizEmail"
                type="email"
                defaultValue={initial.bizEmail}
                required
                placeholder="billing@example.com"
                className={INPUT}
              />
            </Field>

            <Field label="사업장 주소" className="sm:col-span-2">
              <input
                name="bizAddr"
                value={bizAddr}
                onChange={(e) => setBizAddr(e.target.value)}
                placeholder="사업장 주소"
                className={INPUT}
              />
            </Field>
          </div>

          {msg && <Note tone={msg.ok ? "success" : "warning"}>{msg.text}</Note>}

          {/* 발주 권한 확인. 권한 판정에는 쓰지 않는 기록용 동의이며, 확인 대상이 현재 번호라
              저장할 때마다 다시 받는다. */}
          <label className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] border border-[var(--gray-200)] bg-[var(--gray-50)] cursor-pointer">
            <input
              type="checkbox"
              name="attest"
              value="1"
              required
              className="mt-0.5 w-4 h-4 shrink-0 rounded accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--gray-700)] leading-relaxed">
              본인은 위 사업자등록번호의 사업자에 <strong>소속되어 있으며, 해당 명의로 평가를
              발주할 권한이 있음</strong>을 확인합니다. 허위로 기재한 경우 발주와 세금계산서가
              취소될 수 있습니다.
              {initial.attestedAt && (
                <span className="block mt-1 text-[var(--gray-500)]">
                  최근 확인: {initial.attestedAt}
                </span>
              )}
            </span>
          </label>

          <Note tone="muted">
            이미 발행된 세금계산서는 <strong>발주 시점의 정보</strong>로 남습니다. 여기를 고쳐도
            지난 계산서의 상호는 바뀌지 않습니다.
          </Note>

          <div className="flex justify-end pt-1">
            <SubmitButton type="submit" className={BTN_PRIMARY}>
              기업 정보 저장
            </SubmitButton>
          </div>
        </div>
      </Card>
    </form>
  );
}
