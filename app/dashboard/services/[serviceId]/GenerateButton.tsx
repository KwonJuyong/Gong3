"use client";

import { useEffect, useRef } from "react";
import { ui } from "@/app/components/ui";
import SubmitButton from "@/app/components/SubmitButton";
import { generateDraftsAction } from "../actions";

/** 문항 생성 버튼. 서비스를 막 등록하고 들어온 경우 누르지 않아도 바로 시작함. 확정한 문항이 있으면 새 회차용이라 보조 버튼 */
export default function GenerateButton({ serviceId, auto, secondary }: { serviceId: string; auto: boolean; secondary?: boolean }) {
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
        className={secondary ? ui.secondary : ui.primary}
      >
        {secondary ? "새 회차 문항 만들기" : "평가문항 생성"}
      </SubmitButton>
    </form>
  );
}
