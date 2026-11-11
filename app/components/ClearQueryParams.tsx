"use client";

import { useEffect } from "react";

/**
 * 서버 액션이 결과를 ?paid=1·?error= 로 넘기는 화면에서, 안내를 보여준 뒤 주소창에서 그 값을 지움
 * 새로고침해도 같은 안내가 다시 뜨지 않게 하려는 것임. history.replaceState 로 주소만 바꾸고
 * 탭 같은 다른 값은 남김
 */
export default function ClearQueryParams({ keys }: { keys: string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of keys) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // keys 는 화면마다 고정 목록임
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
