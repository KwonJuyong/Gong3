"use client";

import { useSyncExternalStore } from "react";

// 평가 화면이 Evi·메신저 창을 오른쪽 패널(Evi 평가 세션 탭)로 여는 연결 고리. 창은 FloatingHub 하나만 둠
type Request = { title: string; subtitle: string };

let slot: HTMLElement | null = null;
let request: Request | null = null;
// 좁은 화면에서 평가 세션이 페이지 안에 떠 있는지. 떠 있으면 떠 있는 Evi 버튼이 입력칸을 가려 숨김
let inline = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const hubDock = {
  setSlot(el: HTMLElement | null) {
    if (slot === el) return;
    slot = el;
    emit();
  },
  setRequest(next: Request | null) {
    request = next;
    emit();
  },
  setInline(next: boolean) {
    if (inline === next) return;
    inline = next;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useDockSlot = () => useSyncExternalStore(hubDock.subscribe, () => slot, () => null);
export const useDockRequest = () => useSyncExternalStore(hubDock.subscribe, () => request, () => null);
export const useDockInline = () => useSyncExternalStore(hubDock.subscribe, () => inline, () => false);
