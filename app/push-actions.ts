"use server";

import { prisma } from "./db";
import { getSessionUserId } from "./session-server";

/**
 * 구독에 필요한 VAPID 공개키를 런타임에 넘김
 * NEXT_PUBLIC_ 로 두면 빌드 시점에 번들에 박혀 Docker 빌드 인자가 필요해지므로,
 * 서버 액션으로 받아감. 공개키라 노출 자체는 문제없음
 */
export async function getVapidPublicKey(): Promise<string | null> {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// 서버가 endpoint 로 직접 요청을 보내므로 브라우저 푸시 서비스 주소만 받음(내부 주소 등록 시 SSRF).
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".push.apple.com",
  ".notify.windows.com",
];

function isPushEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.port || raw.length > 1000) return false;
  return PUSH_HOSTS.some((h) => (h.startsWith(".") ? u.hostname.endsWith(h) : u.hostname === h));
}

/** 브라우저가 발급한 구독을 현재 로그인 사용자에게 묶어 저장함 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  if (!isPushEndpoint(sub.endpoint) || sub.p256dh.length > 200 || sub.auth.length > 100) return { ok: false };

  // endpoint가 구독의 고유 주소임. 같은 브라우저에서 다른 계정으로 로그인하면
  // 소유자만 갈아끼워야 이전 사용자에게 알림이 가지 않음
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
  });

  return { ok: true };
}

/** 알림 끄기: 구독 해제. */
export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return { ok: true };
}
