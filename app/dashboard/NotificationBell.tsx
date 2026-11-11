"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SubmitButton from "../components/SubmitButton";
import { useEscape } from "../components/useEscape";
import {
  createAnnouncementAction,
  deleteAllNotificationsAction,
  deleteNotificationAction,
  markNotificationsReadAction,
} from "../actions";

export type NotificationItem = {
  id: string;
  content: string;
  type: string;
  fromStudentId: string | null;
  fromName: string | null;
  createdAt: string;
};

/** "방금 · 5분 전 · 3시간 전 · 2일 전 · 8/12" */
function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(t).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });
}

/** 머리글 알림 종과 알림함. 열면 전부 읽음 처리함 */
export default function NotificationBell({
  notifications,
  unreadCount,
  canAnnounce,
}: {
  notifications: NotificationItem[];
  /** 알림함은 최근 건만 싣기 때문에 개수는 DB 에서 따로 센 값을 씀 */
  unreadCount: number;
  canAnnounce: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notis, setNotis] = useState(notifications);
  const [unread, setUnread] = useState(unreadCount);
  const ref = useRef<HTMLDivElement>(null);

  // 서버 값이 새로 내려오면 로컬 상태를 맞춤
  const [synced, setSynced] = useState({ notifications, unreadCount });
  if (synced.notifications !== notifications || synced.unreadCount !== unreadCount) {
    setSynced({ notifications, unreadCount });
    setNotis(notifications);
    setUnread(unreadCount);
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEscape(open, () => setOpen(false));

  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    // 폰에서는 메신저 창이 화면 대부분을 덮어 알림함이 가려짐
    window.dispatchEvent(new Event("hub:close"));
    if (unread > 0) {
      setUnread(0);
      void markNotificationsReadAction();
    }
  }

  async function clearAll() {
    setNotis([]);
    setUnread(0);
    await deleteAllNotificationsAction();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `알림 ${unread}건 읽지 않음` : "알림"}
        aria-expanded={open}
        className="relative w-10 h-10 flex items-center justify-center rounded-[var(--radius-md)] text-[var(--gray-700)] hover:bg-[var(--gray-50)]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-xs font-semibold leading-[18px] text-center ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="알림"
          className="fixed left-3 right-3 top-[60px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 z-50 max-h-[min(75vh,560px)] flex flex-col bg-white rounded-[var(--radius-lg)] border border-[var(--gray-200)] shadow-[var(--shadow-lg)] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--gray-100)] shrink-0">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">알림</h2>
            <div className="flex items-center gap-3">
              {notis.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                  모두 지우기
                </button>
              )}
              <Link
                href="/dashboard/profile?tab=notify"
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                알림 설정
              </Link>
            </div>
          </div>

          {canAnnounce && (
            <form action={createAnnouncementAction} className="flex gap-2 p-2 border-b border-[var(--gray-100)] shrink-0">
              <input
                name="content"
                placeholder="공지사항 입력..."
                aria-label="공지사항"
                required
                className="flex-1 min-w-0 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--gray-200)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
              />
              <SubmitButton type="submit" className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--accent-dark)] transition-colors shrink-0">
                공지
              </SubmitButton>
            </form>
          )}

          <ul className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[var(--gray-100)]">
            {notis.length === 0 && (
              <li className="text-sm text-[var(--gray-500)] text-center py-10">알림이 없어요</li>
            )}
            {notis.map((n) => {
              const who = n.fromStudentId ? `${n.fromStudentId}${n.fromName ? ` (${n.fromName})` : ""}` : null;
              return (
                <li key={n.id} className="flex justify-between items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    {n.type === "ANNOUNCE" && <span className="text-xs font-semibold text-amber-700">공지</span>}
                    <p className="text-sm text-[var(--foreground)] break-words">{n.content}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {who && <span>발신: {who} · </span>}
                      {ago(n.createdAt)}
                    </p>
                  </div>
                  <form
                    action={deleteNotificationAction}
                    className="shrink-0"
                    onSubmit={() => setNotis((prev) => prev.filter((x) => x.id !== n.id))}
                  >
                    <input type="hidden" name="notificationId" value={n.id} />
                    <SubmitButton type="submit" className="w-7 h-7 rounded-[var(--radius-sm)] text-[var(--gray-500)] flex items-center justify-center hover:bg-[var(--gray-100)] transition-colors" aria-label="알림 삭제" title="삭제">
                      &times;
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
