"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { ActionState } from "@/app/db";

/**
 * useActionState 와 같되 제출 후 입력칸을 비우지 않음. 반환한 form 을 <form {...form}> 으로 펼쳐 씀
 * <form action> 만 쓰면 React 가 액션이 끝난 뒤 비제어 입력칸을 초기화해, 서버가 오류를 돌려주면 처음부터 다시 입력하게 됨
 * action 은 하이드레이션 전 제출용으로 남김(없으면 브라우저 기본 GET 제출로 비밀번호가 주소에 붙음)
 */
export function useFormSubmit(action: (state: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, null);
  const form = {
    action: dispatch,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => dispatch(formData));
    },
  };
  return [state, form, pending] as const;
}
