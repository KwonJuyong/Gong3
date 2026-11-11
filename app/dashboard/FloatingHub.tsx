"use client";

import { confirmDialog, toast } from "@/app/components/feedback";
import { useEscape } from "@/app/components/useEscape";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listRooms,
  getRoom,
  sendMessage,
  sendAiMessage,
  getUnreadTotal,
  createDmRoom,
  createGroupRoom,
  createAiRoom,
  leaveRoom,
  searchUsers,
  pinRoom,
  reorderPinnedRooms,
  type RoomSummary,
  type RoomDetail,
  type RoomMessage,
  type Attachment,
  type UserLite,
} from "./messenger/actions";
// 모든 대시보드 페이지 우하단에 떠 있는 통합 메신저.
// 카카오톡식 채팅방 모델: 1:1(DM) / 단체(GROUP) / AI 도우미(AI).

type View = "list" | "room" | "new";
type NewMode = "pick" | "dm" | "group";

export default function FloatingHub({
  initialUnreadMessages,
}: {
  initialUnreadMessages: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");

  // 방 목록
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(initialUnreadMessages);
  const [dragId, setDragId] = useState<string | null>(null); // 고정 방 드래그 중인 id

  // 열린 방
  const [activeRoom, setActiveRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  // 작성창
  const [msgInput, setMsgInput] = useState("");
  const [pendingAtt, setPendingAtt] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 새 채팅
  const [newMode, setNewMode] = useState<NewMode>("pick");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserLite[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const viewRef = useRef(view);
  const activeRoomRef = useRef(activeRoom);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // 폰에서는 이 창이 화면 대부분을 덮으므로 알림함을 열면 닫음
  useEffect(() => {
    const h = () => setOpen(false);
    window.addEventListener("hub:close", h);
    return () => window.removeEventListener("hub:close", h);
  }, []);
  useEscape(open, () => setOpen(false));

  const refreshRooms = useCallback(async () => {
    const list = await listRooms();
    setRooms(list);
    setUnreadMessages(list.reduce((s, r) => s + r.unreadCount, 0));
  }, []);

  const refreshUnread = useCallback(async () => {
    setUnreadMessages(await getUnreadTotal());
  }, []);

  const reloadRoom = useCallback(async (id: string) => {
    const data = await getRoom(id);
    if (data) {
      setActiveRoom(data.detail);
      setMessages(data.messages);
    }
  }, []);

  /**
   * 실시간 수신(SSE).
   * EventSource 는 실패하면 약 3초마다 계속 재시도하므로, 세션이 만료된 탭이 서버를 계속
   * 두드리지 않도록 직접 닫고 5초부터 최대 60초까지 간격을 늘려 다시 열기
   */
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 5_000;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/messages/stream");

      es.onopen = () => {
        delay = 5_000; // 붙었으면 다음 실패는 다시 처음부터
      };

      es.onerror = () => {
        // 닫지 않으면 브라우저가 약 3초 간격으로 계속 재시도함
        es?.close();
        es = null;
        if (stopped) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 60_000);
      };

      es.onmessage = (e) => {
        let ev: { type: string; conversationId?: string };
        try {
          ev = JSON.parse(e.data);
        } catch {
          return;
        }
        if (ev.type !== "message" && ev.type !== "rooms" && ev.type !== "read") return;
        // 방 목록은 보고 있을 때만 다시 읽음. 나머지 경우에는 배지 숫자만 갱신함
        void (async () => {
          const ar = activeRoomRef.current;
          if (openRef.current && viewRef.current === "room" && ar && ev.conversationId === ar.id) await reloadRoom(ar.id);
          if (openRef.current && viewRef.current === "list") await refreshRooms();
          else await refreshUnread();
        })();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [refreshRooms, refreshUnread, reloadRoom]);

  // 위젯 열면(또는 목록 뷰) 목록 최신화
  useEffect(() => {
    // 상태 갱신은 조회 응답 이후라 동기 갱신 아님
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && view === "list") refreshRooms();
  }, [open, view, refreshRooms]);

  // 스크롤 맨 아래로
  useEffect(() => {
    if (view === "room" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiThinking, view]);

  async function openRoom(id: string) {
    setMsgInput("");
    setPendingAtt([]);
    setAiThinking(false);
    setMessages([]);
    setView("room");
    await reloadRoom(id);
    refreshRooms();
  }

  async function doLeaveRoom() {
    const ar = activeRoom;
    if (!ar) return;
    if (!(await confirmDialog(ar.kind === "GROUP" ? "이 단체 채팅방에서 나갈까요?" : "이 대화를 목록에서 지울까요?"))) return;
    await leaveRoom(ar.id);
    setActiveRoom(null);
    setView("list");
    refreshRooms();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        try {
          const res = await fetch("/api/messages/upload", { method: "POST", body: fd });
          const data = await res.json();
          if (res.ok && data.url) {
            setPendingAtt((prev) => [
              ...prev,
              { url: data.url, name: data.name, kind: data.kind, size: data.size },
            ]);
          } else {
            toast(data.error || `'${file.name}' 업로드 실패`, "error");
          }
        } catch {
          toast(`'${file.name}' 업로드 중 오류가 발생했습니다.`, "error");
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    const text = msgInput.trim();
    const atts = pendingAtt;
    const ar = activeRoom;
    if ((!text && atts.length === 0) || !ar || uploading || sending || aiThinking) return;

    setMsgInput("");
    setPendingAtt([]);

    if (ar.kind === "AI") {
      // 낙관적 사용자 버블
      const temp: RoomMessage = {
        id: `temp-${Date.now()}`,
        content: text,
        attachments: atts,
        senderId: "me",
        senderName: "나",
        isAI: false,
        mine: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, temp]);
      setAiThinking(true);
      try {
        const res = await sendAiMessage(ar.id, text, atts);
        if (res && "error" in res) {
          toast(res.error, "error");
          setMsgInput(text);
          setPendingAtt(atts);
        }
        await reloadRoom(ar.id);
      } finally {
        setAiThinking(false);
      }
      return;
    }

    // DM / GROUP
    setSending(true);
    try {
      const created = await sendMessage(ar.id, text, atts);
      if (created && "error" in created) {
        // 쓴 내용을 잃지 않게 입력창으로 되돌림
        toast(created.error, "error");
        setMsgInput(text);
        setPendingAtt(atts);
      } else if (created) {
        setMessages((prev) =>
          prev.some((m) => m.id === created.id) ? prev : [...prev, created],
        );
      }
    } finally {
      setSending(false);
    }
  }

  function openNew() {
    setNewMode("pick");
    setUserQuery("");
    setUserResults([]);
    setSearchNote("");
    setSelectedUsers([]);
    setGroupTitle("");
    setView("new");
  }

  function pickNewMode(mode: NewMode) {
    setNewMode(mode);
    setUserQuery("");
    setUserResults([]);
    setSearchNote("");
  }

  // 글자마다 조회하지 않고 Enter·검색 버튼으로 한 번만 조회함
  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searching) return;
    setSearching(true);
    try {
      const { users, error } = await searchUsers(userQuery);
      setUserResults(users);
      setSearchNote(error ?? (users.length === 0 ? "검색 결과가 없어요." : ""));
    } finally {
      setSearching(false);
    }
  }

  async function startDm(u: UserLite) {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createDmRoom(u.id);
      if (id) await openRoom(id);
      else toast("대화를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function startAi() {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createAiRoom();
      if (id) await openRoom(id);
      else toast("대화방을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setCreating(false);
    }
  }

  function toggleSelect(u: UserLite) {
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u],
    );
  }

  async function createGroup() {
    if (creating || selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const id = await createGroupRoom(groupTitle, selectedUsers.map((u) => u.id));
      if (id) await openRoom(id);
      else toast("대화방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setCreating(false);
    }
  }

  function timeLabel(iso: string) {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
  }
  function fmtSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── 상단 고정 / 드래그 정렬 ──
  async function togglePin(id: string, pinned: boolean) {
    await pinRoom(id, !pinned);
    refreshRooms();
  }

  function handleDropOnPinned(targetId: string) {
    const src = dragId;
    setDragId(null);
    if (!src || src === targetId) return;
    const pinnedIds = rooms.filter((r) => r.pinned).map((r) => r.id);
    const from = pinnedIds.indexOf(src);
    const to = pinnedIds.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...pinnedIds];
    next.splice(from, 1);
    next.splice(to, 0, src);
    // 낙관적 재정렬
    setRooms((prev) => {
      const map = new Map(prev.filter((r) => r.pinned).map((r) => [r.id, r]));
      const reordered = next.map((id) => map.get(id)).filter(Boolean) as RoomSummary[];
      return [...reordered, ...prev.filter((r) => !r.pinned)];
    });
    reorderPinnedRooms(next).then(refreshRooms);
  }

  function renderRoom(r: RoomSummary, draggable: boolean) {
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        onClick={() => openRoom(r.id)}
        draggable={draggable}
        onDragStart={draggable ? () => setDragId(r.id) : undefined}
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onDragOver={draggable ? (e) => e.preventDefault() : undefined}
        onDrop={draggable ? () => handleDropOnPinned(r.id) : undefined}
        className={`group w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--gray-100)] hover:bg-[var(--gray-50)] transition-colors text-left cursor-pointer ${
          dragId === r.id ? "opacity-40" : ""
        }`}
      >
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
            r.kind === "AI"
              ? "bg-[var(--accent)] text-white text-xs"
              : r.kind === "GROUP"
                ? "bg-violet-100 text-violet-600"
                : "bg-[var(--gray-100)] text-[var(--gray-600)]"
          }`}
        >
          {r.kind === "GROUP" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ) : (
            r.avatarLabel
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--foreground)] truncate flex items-center gap-1">
              {r.pinned && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent)] shrink-0">
                  <path d="M16 3l5 5-4 1-4 4 1 5-2 2-4-6-5 5-1-1 5-5-6-4 2-2 5 1 4-4 1-4z" />
                </svg>
              )}
              <span className="truncate">{r.title}</span>
              {r.kind === "GROUP" && (
                <span className="text-xs text-[var(--gray-500)]">{r.memberCount}</span>
              )}
            </span>
            {r.lastAt && (
              <span className="text-xs text-[var(--gray-500)] shrink-0">{timeLabel(r.lastAt)}</span>
            )}
          </span>
          <span className="text-xs text-[var(--muted)] truncate block">
            {r.lastContent || "새 대화"}
          </span>
        </span>
        {/* 고정 토글 (고정 방은 항상, 일반 방은 hover 시) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePin(r.id, r.pinned);
          }}
          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-opacity ${
            r.pinned
              ? "text-[var(--accent)]"
              : "text-[var(--gray-500)] opacity-0 group-hover:opacity-100 hover:text-[var(--foreground)]"
          }`}
          aria-label={r.pinned ? "고정 해제" : "상단 고정"}
          title={r.pinned ? "고정 해제" : "상단 고정"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={r.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3l5 5-4 1-4 4 1 5-2 2-4-6-5 5-1-1 5-5-6-4 2-2 5 1 4-4 1-4z" />
          </svg>
        </button>
        {r.unreadCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 bg-[var(--danger)] text-white text-xs font-semibold rounded-full flex items-center justify-center shrink-0">
            {r.unreadCount}
          </span>
        )}
      </div>
    );
  }

  const headerTitle =
    view === "room"
      ? activeRoom?.title || "대화"
      : view === "new"
        ? "새 채팅"
        : "메신저";

  const showBack = view === "room" || view === "new";

  // 첨부 렌더 (메시지 버블 내부)
  function renderAttachments(m: RoomMessage) {
    const imgs = m.attachments.filter((a) => a.kind === "image");
    const files = m.attachments.filter((a) => a.kind === "file");
    return (
      <>
        {imgs.length > 0 && (
          <div className={`flex flex-wrap gap-1 mb-1 ${m.mine ? "justify-end" : "justify-start"}`}>
            {imgs.map((a, ai) => (
              <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.name}
                  className="max-w-[180px] max-h-[180px] rounded-[var(--radius-md)] border border-[var(--gray-200)] object-cover"
                />
              </a>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className={`flex flex-col gap-1 mb-1 ${m.mine ? "items-end" : "items-start"}`}>
            {files.map((a, ai) => (
              <a
                key={ai}
                href={`${a.url}?name=${encodeURIComponent(a.name)}`}
                download={a.name}
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-200)] text-[var(--gray-700)] hover:bg-[var(--gray-50)] transition-colors max-w-[240px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--muted)]">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="min-w-0">
                  <span className="text-xs font-medium truncate block">{a.name}</span>
                  {a.size ? <span className="text-xs text-[var(--gray-500)]">{fmtSize(a.size)}</span> : null}
                </span>
              </a>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[70] w-14 h-14 rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-lg)] flex items-center justify-center hover:bg-[var(--accent-dark)] transition-colors"
          aria-label="메신저 열기"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <path d="M8 12h.01M12 12h.01M16 12h.01" />
          </svg>
          {unreadMessages > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-[var(--danger)] text-white text-xs font-semibold rounded-full flex items-center justify-center border-2 border-white">
              {unreadMessages > 99 ? "99+" : unreadMessages}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,400px)] h-[min(82vh,600px)] bg-white rounded-[var(--radius-xl)] border border-[var(--gray-200)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 h-12 border-b border-[var(--gray-200)] shrink-0 bg-[var(--accent)] text-white">
            {showBack ? (
              <button
                onClick={() => {
                  setView("list");
                  setActiveRoom(null);
                }}
                className="w-7 h-7 -ml-1 rounded-[var(--radius-md)] flex items-center justify-center hover:bg-white/15"
                aria-label="뒤로"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <span className="w-6 h-6 ml-1 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                AI
              </span>
            )}
            <h2 className="text-sm font-semibold flex-1 truncate">
              {headerTitle}
              {view === "room" && activeRoom?.kind === "GROUP" && (
                <span className="ml-1.5 text-xs font-normal opacity-80">
                  {activeRoom.members.length}
                </span>
              )}
            </h2>
            {view === "room" && activeRoom && (
              <button
                onClick={doLeaveRoom}
                className="px-2 h-7 rounded-[var(--radius-md)] text-xs flex items-center hover:bg-white/15"
                title="나가기"
              >
                나가기
              </button>
            )}
            {view === "list" && (
              <button
                onClick={openNew}
                className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center hover:bg-white/15"
                aria-label="새 채팅"
                title="새 채팅"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center hover:bg-white/15"
              aria-label="닫기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {view === "list" && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {rooms.length === 0 && (
                <p className="text-sm text-[var(--gray-500)] text-center py-8">
                  대화가 없습니다. 우측 상단 + 로 새 채팅을 시작하세요.
                </p>
              )}

              {/* 고정 방 (드래그로 순서 조정) */}
              {rooms.some((r) => r.pinned) && (
                <>
                  <div className="px-4 pt-2 pb-1 text-xs font-semibold text-[var(--gray-500)] bg-[var(--surface)]">
                    고정
                  </div>
                  {rooms.filter((r) => r.pinned).map((r) => renderRoom(r, true))}
                </>
              )}

              {/* 일반 방 (최근순) */}
              {rooms.some((r) => r.pinned) && rooms.some((r) => !r.pinned) && (
                <div className="px-4 pt-2 pb-1 text-xs font-semibold text-[var(--gray-500)] bg-[var(--surface)]">
                  일반
                </div>
              )}
              {rooms.filter((r) => !r.pinned).map((r) => renderRoom(r, false))}
            </div>
          )}

          {view === "new" && (
            <div className="flex-1 flex flex-col min-h-0 bg-white">
              {newMode === "pick" && (
                <div className="p-3 space-y-2">
                  <button
                    onClick={() => pickNewMode("dm")}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--gray-200)] hover:bg-[var(--gray-50)] transition-colors text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-[var(--gray-100)] text-[var(--gray-600)] flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </span>
                    <span>
                      <span className="text-sm font-medium block">1:1 대화</span>
                      <span className="text-xs text-[var(--muted)]">사람을 찾아 대화를 시작</span>
                    </span>
                  </button>
                  <button
                    onClick={() => pickNewMode("group")}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--gray-200)] hover:bg-[var(--gray-50)] transition-colors text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </span>
                    <span>
                      <span className="text-sm font-medium block">단체 채팅방</span>
                      <span className="text-xs text-[var(--muted)]">여러 명을 초대</span>
                    </span>
                  </button>
                  <button
                    onClick={startAi}
                    disabled={creating}
                    className="w-full flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--gray-200)] hover:bg-[var(--gray-50)] transition-colors text-left disabled:opacity-50"
                  >
                    <span className="w-9 h-9 rounded-full bg-[var(--accent)] text-white text-xs font-semibold flex items-center justify-center shrink-0">AI</span>
                    <span>
                      <span className="text-sm font-medium block">AI 도우미</span>
                      <span className="text-xs text-[var(--muted)]">새 AI 대화방을 생성</span>
                    </span>
                  </button>
                </div>
              )}

              {(newMode === "dm" || newMode === "group") && (
                <>
                  <div className="p-3 border-b border-[var(--gray-100)] shrink-0 space-y-2">
                    {newMode === "group" && (
                      <input
                        value={groupTitle}
                        onChange={(e) => setGroupTitle(e.target.value)}
                        placeholder="방 이름 (선택)"
                        className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                      />
                    )}
                    <form onSubmit={runSearch} className="flex gap-2">
                      <input
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder="이름 또는 학번"
                        aria-label="이름 또는 학번 검색"
                        className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                      />
                      <button
                        type="submit"
                        disabled={searching}
                        className="shrink-0 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
                      >
                        {searching ? "검색 중" : "검색"}
                      </button>
                    </form>
                    {newMode === "group" && selectedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedUsers.map((u) => (
                          <span key={u.id} className="text-xs bg-[var(--accent)] text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                            {u.name}
                            <button onClick={() => toggleSelect(u)} aria-label="제거">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {userResults.length === 0 && (
                      <p className="text-sm text-[var(--gray-500)] text-center py-8">
                        {searchNote || "이름이나 학번을 입력하고 Enter 를 눌러 주세요."}
                      </p>
                    )}
                    {userResults.map((u) => {
                      const picked = selectedUsers.some((x) => x.id === u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => (newMode === "dm" ? startDm(u) : toggleSelect(u))}
                          disabled={creating}
                          className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--gray-100)] hover:bg-[var(--gray-50)] transition-colors text-left disabled:opacity-50"
                        >
                          <span className="w-9 h-9 rounded-full bg-[var(--gray-100)] text-[var(--gray-600)] flex items-center justify-center text-sm font-medium shrink-0">
                            {u.name.charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-[var(--foreground)] truncate block">{u.name}</span>
                            <span className="text-xs text-[var(--muted)] truncate block">
                              {u.studentId}{u.major ? ` · ${u.major}` : ""}
                            </span>
                          </span>
                          {newMode === "group" && (
                            <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${picked ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "border-[var(--gray-300)]"}`}>
                              {picked && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {newMode === "group" && (
                    <div className="p-3 border-t border-[var(--gray-100)] shrink-0">
                      <button
                        onClick={createGroup}
                        disabled={creating || selectedUsers.length === 0}
                        className="w-full py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
                      >
                        {selectedUsers.length}명과 방 만들기
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 방(대화) */}
          {view === "room" && activeRoom && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-[var(--surface)]">
                {activeRoom.truncated && (
                  <p className="text-xs text-[var(--muted)] text-center">최근 메시지만 표시하고 있어요.</p>
                )}
                {activeRoom.kind === "AI" && messages.length === 0 && !aiThinking && (
                  <div className="text-sm text-[var(--gray-500)] bg-white rounded-[var(--radius-lg)] p-3">
                    무엇이든 물어보세요. 예: &quot;진행 중 평가 목록 보여줘&quot;, &quot;학생 평가자 명단 알려줘&quot;. 이미지나 텍스트 파일(txt·csv·md·json)을 첨부해 물어볼 수도 있어요.
                  </div>
                )}
                {activeRoom.kind !== "AI" && messages.length === 0 && (
                  <p className="text-sm text-[var(--gray-500)] text-center py-8">첫 메시지를 보내보세요</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className="group max-w-[85%]">
                      {!m.mine && activeRoom.kind === "GROUP" && (
                        <span className="text-xs text-[var(--gray-500)] ml-1 mb-0.5 block">{m.senderName}</span>
                      )}
                      {renderAttachments(m)}
                      {m.content && (
                        <div
                          className={`px-3 py-2 rounded-[var(--radius-lg)] text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            m.mine
                              ? "bg-[var(--accent)] text-white"
                              : m.isAI
                                ? "bg-white border border-[var(--gray-200)] text-[var(--gray-700)]"
                                : "bg-white border border-[var(--gray-200)] text-[var(--gray-700)]"
                          }`}
                        >
                          {m.content}
                        </div>
                      )}
                      <span className={`text-xs text-[var(--gray-500)] mt-0.5 block ${m.mine ? "text-right" : "text-left"}`}>
                        {timeLabel(m.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
                {aiThinking && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-[var(--radius-lg)] bg-white text-sm text-[var(--gray-500)]">
                      답변 생성 중…
                    </div>
                  </div>
                )}
              </div>

              {(pendingAtt.length > 0 || uploading) && (
                <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-[var(--gray-100)] bg-white">
                  {pendingAtt.map((a, i) =>
                    a.kind === "image" ? (
                      <span key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.name} className="w-12 h-12 object-cover rounded-[var(--radius-md)] border border-[var(--gray-200)]" />
                        <button onClick={() => setPendingAtt((prev) => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--danger)] text-white text-xs flex items-center justify-center" aria-label="제거">×</button>
                      </span>
                    ) : (
                      <span key={i} className="text-xs text-[var(--gray-600)] bg-[var(--gray-100)] px-2 py-1 rounded flex items-center gap-1">
                        {a.name}
                        <button onClick={() => setPendingAtt((prev) => prev.filter((_, j) => j !== i))} aria-label="제거">×</button>
                      </span>
                    ),
                  )}
                  {uploading && <span className="text-xs text-[var(--gray-500)] px-2 py-1">업로드 중…</span>}
                </div>
              )}

              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="p-2.5 border-t border-[var(--gray-100)] flex items-center gap-1.5 shrink-0 bg-white"
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.csv,.tsv,.md,.json,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip,.7z,.rar"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 w-9 h-9 rounded-[var(--radius-md)] border border-[var(--gray-300)] text-[var(--muted)] flex items-center justify-center hover:bg-[var(--gray-50)]"
                  aria-label="파일 첨부"
                  title="이미지·문서 첨부"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-[var(--radius-md)] bg-white border border-[var(--gray-300)] text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors"
                />
                <button
                  type="submit"
                  disabled={uploading || sending || aiThinking}
                  className="shrink-0 w-9 h-9 rounded-[var(--radius-md)] bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-dark)] transition-colors disabled:opacity-50"
                  aria-label="전송"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
