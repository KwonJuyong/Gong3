import webpush from "web-push";
import { prisma } from "@/app/db";

// 웹 푸시 발송. VAPID 키가 없으면 아무것도 하지 않음
let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }

  // subject 는 푸시 서비스에 전달되는 발신자 연락처임. 개인 이메일이 아니라 운영 계정을 씀
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:labchain.hallym@gmail.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * 여러 사용자의 모든 기기로 푸시를 보냄
 * 인앱 알림은 이미 저장돼 있으므로 실패해도 예외를 던지지 않음
 */
export async function pushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !configure()) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const expired: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        // 404/410 은 구독이 폐기된 것이라 지우고, 그 외 오류는 일시적일 수 있어 유지함
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(sub.endpoint);
      }
    }),
  );

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
  }
}
