"use client";

import { useEffect, useRef } from "react";
import SubmitButton from "@/app/components/SubmitButton";
import { generateDraftsAction } from "../actions";

/** 첫 문항 생성 버튼. 서비스를 막 등록하고 들어온 경우 누르지 않아도 바로 시작함 */
export default function GenerateButton({ serviceId, auto }: { serviceId: string; auto: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    formRef.current?.requestSubmit();
  }, [auto]);

  return (
    <form ref={formRef} action={generateDraftsAction}>
      <input type="hidden" name="serviceId" value={serviceId} />
      <SubmitButton
        pendingText="문항 만드는 중… 1분 정도 걸려요"
        className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] whitespace-nowrap"
      >
        평가문항 생성
      </SubmitButton>
    </form>
  );
}
