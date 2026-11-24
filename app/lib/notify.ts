import { prisma } from "@/app/db";
import { pushToUsers } from "./push";

export type NotificationRow = {
  userId: string;
  content: string;
  type?: string;
  fromUserId?: string;
  /** 이 알림만의 이동 경로. 없으면 options.link */
  link?: string;
};

export type NotifyOptions = {
  /** 알림 클릭 시 열 경로(앱 안 알림·푸시 공통). 푸시 기본값 /dashboard */
  link?: string;
  /**
   * 푸시로도 보낼지. 기본 true.
   * 참여 신청처럼 자주 생기는 이벤트는 false 로 두고 인앱 알림에만 쌓음
   */
  push?: boolean;
};

/** 인앱 알림 저장 + 웹 푸시 발송. 푸시 실패는 무시함 */
export async function createNotifications(rows: NotificationRow[], options: NotifyOptions = {}) {
  if (rows.length === 0) return;

  const linked = rows.map((r) => ({ ...r, link: r.link ?? options.link ?? null }));
  await prisma.notification.createMany({ data: linked });

  if (options.push === false) return;
  await pushNotificationRows(linked);
}

/** 이미 저장한 알림의 웹 푸시만 발송. 트랜잭션 안에서 알림을 저장한 경우 커밋 뒤에 부름 */
export async function pushNotificationRows(rows: { userId: string; content: string; link?: string | null }[]) {
  // 같은 문구·경로를 여러 명에게 보내는 경우가 많아 묶어서 발송함
  const groups = new Map<string, { content: string; url: string; userIds: string[] }>();
  for (const row of rows) {
    const url = row.link ?? "/dashboard";
    const key = `${url}\n${row.content}`;
    const g = groups.get(key) ?? { content: row.content, url, userIds: [] };
    g.userIds.push(row.userId);
    groups.set(key, g);
  }

  await Promise.all(
    Array.from(groups.values()).map((g) => pushToUsers(g.userIds, { title: "AI 평가단", body: g.content, url: g.url })),
  );
}
