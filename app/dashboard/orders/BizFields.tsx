"use client";

import { useState, useTransition } from "react";
import { lookupBizAction } from "./actions";

// 발주 폼의 공급받는자(기업) 정보 입력.
// 사업자번호로 [조회]하면 팝빌에서 상호·대표자·주소를 채움. 조회에 실패하면 직접 입력함
// 이메일은 조회 결과에 없어 항상 직접 입력함

export default function BizFields({
  initial,
}: {
  initial: { bizNo: string; bizName: string; bizCeo: string; bizAddr: string; bizEmail: string };
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
        setMsg({ ok: true, text: "회사 정보를 불러왔습니다." });
      } else {
        setMsg({ ok: false, text: r.error ?? "조회에 실패했습니다." });
      }
    });
  };

  const box =
    "px-3 py-2 text-sm border border-[var(--gray-200)] rounded-[var(--radius-md)]";

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex gap-2">
          <input
            name="bizNo"
            value={bizNo}
            onChange={(e) => setBizNo(e.target.value)}
            required
            placeholder="사업자등록번호 (10자리)"
            inputMode="numeric"
            className={`flex-1 min-w-0 ${box}`}
          />
          <button
            type="button"
            onClick={lookup}
            disabled={pending}
            className="shrink-0 px-3 py-2 text-xs font-medium border border-[var(--gray-300)] rounded-[var(--radius-md)] hover:bg-[var(--gray-50)] disabled:opacity-50"
          >
            {pending ? "조회 중" : "조회"}
          </button>
        </div>
        <input
          name="bizName"
          value={bizName}
          onChange={(e) => setBizName(e.target.value)}
          required
          placeholder="상호"
          className={box}
        />
        <input
          name="bizCeo"
          value={bizCeo}
          onChange={(e) => setBizCeo(e.target.value)}
          placeholder="대표자명"
          className={box}
        />
        <input
          name="bizEmail"
          type="email"
          defaultValue={initial.bizEmail}
          required
          placeholder="세금계산서 수신 이메일"
          className={box}
        />
        <input
          name="bizAddr"
          value={bizAddr}
          onChange={(e) => setBizAddr(e.target.value)}
          placeholder="사업장 주소"
          className={`sm:col-span-2 ${box}`}
        />
      </div>
      {msg && (
        <p
          className={`text-xs mt-2 ${msg.ok ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
        >
          {msg.text}
        </p>
      )}
    </>
  );
}
