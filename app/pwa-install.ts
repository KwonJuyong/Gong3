"use client";

import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// beforeinstallprompt는 페이지 로드 직후 딱 한 번 발생하고, 이미 설치된 앱에서는
// 아예 발생하지 않는다(그때 크롬 주소창은 "설치" 대신 "앱에서 열기"를 띄운다).
// 컴포넌트가 마운트되기 전에 지나갈 수 있으므로 모듈 로드 시점에 붙잡아 보관하고,
// 설치 UI를 가진 컴포넌트들(하단 배너, NavRail 설치 모달)이 이걸 함께 구독한다.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 브라우저 기본 미니 인포바를 막고 우리 UI로 유도
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** 브라우저가 설치 프롬프트를 넘겨줬는가 = 지금 진짜 설치 버튼을 띄울 수 있는가 */
export function useCanInstall() {
  return useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false, // SSR: 서버에선 알 수 없다
  );
}

/** 네이티브 설치 프롬프트를 띄운다. 사용자가 수락하면 true. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const evt = deferred;
  await evt.prompt();
  const { outcome } = await evt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  deferred = null; // 프롬프트 이벤트는 1회용이라 재사용할 수 없다
  emit();
  return outcome === "accepted";
}
