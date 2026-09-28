"use server";

import { prisma } from "./db";
import { getSessionUserId } from "./session-server";

/**
 * 구독에 필요한 VAPID 공개키를 런타임에 넘긴다.
 * NEXT_PUBLIC_ 로 두면 빌드 시점에 번들에 박혀 Docker 빌드 인자가 필요해지므로,
 * 서버 액션으로 받아간다. 공개키라 노출 자체는 문제없다.
 */
export async function getVapidPublicKey(): Promise<string | null> {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** 브라우저가 발급한 구독을 현재 로그인 사용자에게 묶어 저장한다. */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };

  // endpoint가 구독의 고유 주소다. 같은 브라우저에서 다른 계정으로 로그인하면
  // 소유자만 갈아끼워야 이전 사용자에게 알림이 가지 않는다.
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
  });

  return { ok: true };
}

/** 알림 끄기 — 구독 해제. */
export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return { ok: true };
}
