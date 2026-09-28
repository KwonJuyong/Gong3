"use client";

import { getVapidPublicKey, savePushSubscription, deletePushSubscription } from "./push-actions";

// VAPID 공개키는 base64url 문자열로 오는데, pushManager.subscribe는 바이트 배열을 요구한다.
function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 이 브라우저가 웹 푸시를 지원하는가. (iOS는 홈 화면에 설치해야만 true) */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 현재 브라우저의 구독. 없으면 null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type EnableResult = "ok" | "denied" | "unsupported" | "error";

/** 권한 요청 → 구독 발급 → 서버 저장. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";

  // 브라우저는 사용자 제스처 안에서의 권한 요청만 신뢰한다 — 반드시 버튼 클릭에서 호출할 것.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const key = await getVapidPublicKey();
  if (!key) return "error"; // 서버에 VAPID 키가 설정되지 않음

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // 조용한 푸시는 금지 — 반드시 알림을 띄워야 한다
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });

  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return "error";

  const res = await savePushSubscription({
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  return res.ok ? "ok" : "error";
}

/** 서버 구독 삭제 후 브라우저 구독도 해제. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
