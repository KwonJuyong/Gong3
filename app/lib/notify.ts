import { prisma } from "@/app/db";
import { pushToUsers } from "./push";

export type NotificationRow = {
  userId: string;
  content: string;
  type?: string;
  fromUserId?: string;
};

export type NotifyOptions = {
  /** 알림 클릭 시 열 경로. 기본값 /dashboard. */
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

  await prisma.notification.createMany({ data: rows });

  if (options.push === false) return;
  const link = options.link ?? "/dashboard";

  // 같은 문구를 여러 명에게 보내는 경우가 많아 내용별로 묶어 발송함
  const byContent = new Map<string, string[]>();
  for (const row of rows) {
    const users = byContent.get(row.content) ?? [];
    users.push(row.userId);
    byContent.set(row.content, users);
  }

  await Promise.all(
    Array.from(byContent).map(([content, userIds]) =>
      pushToUsers(userIds, { title: "AI 평가단", body: content, url: link }),
    ),
  );
}
