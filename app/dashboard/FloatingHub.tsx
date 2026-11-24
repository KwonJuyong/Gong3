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
import { ui } from "@/app/components/ui";
import Icon from "@/app/components/Icon";
import EviAvatar from "@/app/components/EviAvatar";
import { normalizeUploadFile } from "@/app/lib/projectGuides";
import { hubDock, useDockInline, useDockRequest } from "./hubDock";
// 모든 대시보드 페이지 우하단에 떠 있는 통합 메신저.
// 카카오톡식 채팅방 모델: 1:1(DM) / 단체(GROUP) / Evi(AI).

type View = "list" | "room" | "new";
type NewMode = "pick" | "dm" | "group";

export default function FloatingHub({
  initialUnreadMessages,
}: {
  initialUnreadMessages: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const dock = useDockRequest();
  const inline = useDockInline();
  const [dockTab, setDockTab] = useState<"bot" | "messenger">("bot");
  const dockSlot = useCallback((el: HTMLDivElement | null) => hubDock.setSlot(el), []);

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

  const openRoom = useCallback(async (id: string) => {
    setMsgInput("");
    setPendingAtt([]);
    setAiThinking(false);
    setMessages([]);
    setView("room");
    await reloadRoom(id);
    refreshRooms();
  }, [reloadRoom, refreshRooms]);

  useEffect(() => {
    const showConversation = (event: Event) => {
      setOpen(true);
      const detail = event instanceof CustomEvent ? event.detail : null;
      // 문자열은 대화 id, 객체는 { room, draft }(평가 화면에서 문의할 때 어떤 평가인지 입력칸에 미리 채움)
      const id = typeof detail === "string" ? detail : typeof detail?.room === "string" ? detail.room : null;
      if (!id) return setView("list");
      void openRoom(id).then(() => {
        if (typeof detail?.draft === "string") setMsgInput(detail.draft);
      });
    };
    window.addEventListener("hub:open", showConversation);
    return () => window.removeEventListener("hub:open", showConversation);
  }, [openRoom]);

  async function doLeaveRoom() {
    const ar = activeRoom;
    if (!ar) return;
    if (!(await confirmDialog(ar.kind === "GROUP" ? "이 단체 채팅방에서 나갈까요?" : "이 대화를 목록에서 지울까요?"))) return;
    await leaveRoom(ar.id);
    setActiveRoom(null);
    setView("list");
    refreshRooms();
  }

  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const raw of Array.from(files)) {
        const file = normalizeUploadFile(raw);
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

  // 상단 고정 / 드래그 정렬
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

  const pinIcon = (filled: boolean, size: number) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3l5 5-4 1-4 4 1 5-2 2-4-6-5 5-1-1 5-5-6-4 2-2 5 1 4-4 1-4z" />
    </svg>
  );

  function avatarOf(kind: string, label: string) {
    if (kind === "AI") return <EviAvatar size={40} />;
    if (kind === "GROUP") return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]"><Icon name="users" size={18} /></span>;
    return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gray-100)] text-sm font-semibold text-[var(--gray-700)]">{label}</span>;
  }

  function renderRoom(r: RoomSummary, draggable: boolean) {
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        onClick={() => openRoom(r.id)}
        onKeyDown={(e) => { if (e.key === "Enter") openRoom(r.id); }}
        draggable={draggable}
        onDragStart={draggable ? () => setDragId(r.id) : undefined}
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onDragOver={draggable ? (e) => e.preventDefault() : undefined}
        onDrop={draggable ? () => handleDropOnPinned(r.id) : undefined}
        className={`group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--gray-50)] ${dragId === r.id ? "opacity-40" : ""}`}
      >
        {avatarOf(r.kind, r.avatarLabel)}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
              {r.pinned && <span className="text-[var(--accent)]">{pinIcon(true, 12)}</span>}
              <span className="truncate">{r.title}</span>
              {r.kind === "GROUP" && <span className="text-xs font-normal text-[var(--muted)]">{r.memberCount}</span>}
            </span>
            {r.lastAt && <span className="shrink-0 text-xs text-[var(--muted)]">{timeLabel(r.lastAt)}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{r.lastContent || "새 대화"}</span>
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(r.id, r.pinned); }}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${r.pinned ? "text-[var(--accent)]" : "text-[var(--muted)] opacity-0 hover:bg-[var(--gray-100)] group-hover:opacity-100"}`}
          aria-label={r.pinned ? "고정 해제" : "상단 고정"}
          title={r.pinned ? "고정 해제" : "상단 고정"}
        >
          {pinIcon(r.pinned, 14)}
        </button>
        {r.unreadCount > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--danger)] px-1.5 text-xs font-semibold text-white">{r.unreadCount}</span>
        )}
      </div>
    );
  }

  const headerTitle = view === "room" ? activeRoom?.title || "대화" : view === "new" ? "새 채팅" : "메신저";
  const headerSub = view === "room"
    ? activeRoom?.kind === "AI" ? (aiThinking ? "답을 쓰는 중…" : "평가·일정·보상을 물어보세요") : activeRoom?.kind === "GROUP" ? `${activeRoom.members.length}명` : "1:1 대화"
    : view === "new" ? "대화 상대를 고르세요" : unreadMessages > 0 ? `읽지 않은 메시지 ${unreadMessages}개` : "사람·Evi와 나눈 대화";
  const showBack = view === "room" || view === "new";
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-full text-[var(--gray-700)] transition-colors hover:bg-[var(--gray-100)]";

  // 첨부 렌더 (메시지 버블 내부)
  function renderAttachments(m: RoomMessage) {
    const imgs = m.attachments.filter((a) => a.kind === "image");
    const files = m.attachments.filter((a) => a.kind === "file");
    return (
      <>
        {imgs.length > 0 && (
          <div className={`mb-1 flex flex-wrap gap-1 ${m.mine ? "justify-end" : "justify-start"}`}>
            {imgs.map((a, ai) => (
              <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className="max-h-[180px] max-w-[180px] rounded-[var(--radius-lg)] object-cover" />
              </a>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className={`mb-1 flex flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
            {files.map((a, ai) => (
              <a key={ai} href={`${a.url}?name=${encodeURIComponent(a.name)}`} download={a.name}
                className="flex max-w-[240px] items-center gap-2 rounded-[var(--radius-lg)] bg-white px-3 py-2 text-[var(--gray-700)] ring-1 ring-inset ring-[var(--gray-200)] transition-colors hover:bg-[var(--gray-50)]">
                <Icon name="file" size={18} className="text-[var(--muted)]" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{a.name}</span>
                  {a.size ? <span className="text-xs text-[var(--muted)]">{fmtSize(a.size)}</span> : null}
                </span>
              </a>
            ))}
          </div>
        )}
      </>
    );
  }

  const pickCard = "flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-white p-3 text-left ring-1 ring-inset ring-[var(--gray-200)] transition-colors hover:bg-[var(--accent-light)] hover:ring-[var(--accent)] disabled:opacity-50";
  const suggestions = ["진행 중인 내 평가 보여줘", "참여할 수 있는 평가 찾아줘", "받을 보상 알려줘"];

  const messenger = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--gray-100)] px-3">
        {showBack ? (
          <button onClick={() => { setView("list"); setActiveRoom(null); }} className={iconBtn} aria-label="뒤로"><Icon name="back" size={18} /></button>
        ) : (
          <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]"><Icon name="chat" size={16} /></span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <h2 className="truncate text-sm font-semibold">{headerTitle}</h2>
          <p className="truncate text-xs text-[var(--muted)]">{headerSub}</p>
        </div>
        {view === "room" && activeRoom && <button onClick={doLeaveRoom} className={`${iconBtn} w-auto px-3 text-xs font-semibold`}>나가기</button>}
        {view === "list" && <button onClick={openNew} className={iconBtn} aria-label="새 채팅" title="새 채팅"><Icon name="plus" size={18} /></button>}
        {!dock && <button onClick={() => setOpen(false)} className={iconBtn} aria-label="닫기"><Icon name="close" size={18} /></button>}
      </div>

      {view === "list" && (
        <div className="custom-scrollbar flex-1 divide-y divide-[var(--gray-100)] overflow-y-auto">
          {rooms.length === 0 && (
            <div className="space-y-3 px-6 py-10 text-center">
              <p className="text-sm text-[var(--muted)]">아직 대화가 없어요.</p>
              <button onClick={startAi} disabled={creating} className={ui.primary}>Evi에게 물어보기</button>
            </div>
          )}
          {rooms.some((r) => r.pinned) && <p className="bg-[var(--gray-50)] px-4 pb-1 pt-2 text-xs font-semibold text-[var(--muted)]">고정</p>}
          {rooms.filter((r) => r.pinned).map((r) => renderRoom(r, true))}
          {rooms.some((r) => r.pinned) && rooms.some((r) => !r.pinned) && <p className="bg-[var(--gray-50)] px-4 pb-1 pt-2 text-xs font-semibold text-[var(--muted)]">일반</p>}
          {rooms.filter((r) => !r.pinned).map((r) => renderRoom(r, false))}
        </div>
      )}

      {view === "new" && (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--gray-50)]">
          {newMode === "pick" && (
            <div className="space-y-2 p-3">
              <button onClick={startAi} disabled={creating} className={pickCard}>
                <EviAvatar size={40} />
                <span><span className="block text-sm font-semibold">Evi</span><span className="text-xs text-[var(--muted)]">평가·일정·보상을 물어보기</span></span>
              </button>
              <button onClick={() => pickNewMode("dm")} className={pickCard}>
                {avatarOf("DM", "")}
                <span><span className="block text-sm font-semibold">1:1 대화</span><span className="text-xs text-[var(--muted)]">사람을 찾아 대화를 시작</span></span>
              </button>
              <button onClick={() => pickNewMode("group")} className={pickCard}>
                {avatarOf("GROUP", "")}
                <span><span className="block text-sm font-semibold">단체 채팅방</span><span className="text-xs text-[var(--muted)]">여러 명을 초대</span></span>
              </button>
            </div>
          )}

          {(newMode === "dm" || newMode === "group") && (
            <>
              <div className="shrink-0 space-y-2 border-b border-[var(--gray-100)] bg-white p-3">
                {newMode === "group" && (
                  <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="방 이름 (선택)" className={`${ui.field} text-sm`} />
                )}
                <form onSubmit={runSearch} className="flex gap-2">
                  <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="이름 또는 학번" aria-label="이름 또는 학번 검색" className={`${ui.field} min-w-0 flex-1 text-sm`} />
                  <button type="submit" disabled={searching} className={ui.primary}>{searching ? "검색 중" : "검색"}</button>
                </form>
                {newMode === "group" && selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedUsers.map((u) => (
                      <span key={u.id} className={`${ui.badge} bg-[var(--accent)] text-white`}>
                        {u.name}
                        <button onClick={() => toggleSelect(u)} aria-label={`${u.name} 제거`}><Icon name="close" size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="custom-scrollbar flex-1 divide-y divide-[var(--gray-100)] overflow-y-auto bg-white">
                {userResults.length === 0 && (
                  <p className="py-10 text-center text-sm text-[var(--muted)]">{searchNote || "이름이나 학번을 입력하고 Enter 를 눌러 주세요."}</p>
                )}
                {userResults.map((u) => {
                  const picked = selectedUsers.some((x) => x.id === u.id);
                  return (
                    <button key={u.id} onClick={() => (newMode === "dm" ? startDm(u) : toggleSelect(u))} disabled={creating}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--gray-50)] disabled:opacity-50">
                      {avatarOf("DM", u.name.charAt(0))}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{u.name}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{u.studentId}{u.major ? ` · ${u.major}` : ""}</span>
                      </span>
                      {newMode === "group" && (
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${picked ? "bg-[var(--accent)] text-white" : "ring-1 ring-inset ring-[var(--gray-300)]"}`}>
                          {picked && <Icon name="check" size={12} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {newMode === "group" && (
                <div className="shrink-0 border-t border-[var(--gray-100)] bg-white p-3">
                  <button onClick={createGroup} disabled={creating || selectedUsers.length === 0} className={`${ui.primary} w-full`}>{selectedUsers.length}명과 방 만들기</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === "room" && activeRoom && (
        <div
          className={`flex min-h-0 flex-1 flex-col transition-shadow ${dragging ? "ring-2 ring-inset ring-[var(--accent)]" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-[var(--gray-50)] px-3 py-4">
            {activeRoom.truncated && <p className="text-center text-xs text-[var(--muted)]">최근 메시지만 표시하고 있어요.</p>}
            {activeRoom.kind === "AI" && messages.length === 0 && !aiThinking && (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <EviAvatar size={28} />
                  <p className={ui.bubbleAiOnGray}>안녕하세요, Evi예요. 무엇이든 물어보세요. 이미지나 파일(txt·csv·md·json 등)을 끌어다 놓거나 Ctrl+V로 붙여 물어볼 수도 있어요.</p>
                </div>
                <div className="flex flex-wrap gap-2 pl-9">
                  {suggestions.map((q) => <button key={q} type="button" className={ui.chip} onClick={() => setMsgInput(q)}>{q}</button>)}
                </div>
              </div>
            )}
            {activeRoom.kind !== "AI" && messages.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">첫 메시지를 보내 보세요.</p>}
            {messages.map((m, i) => {
              const showAvatar = !m.mine && activeRoom.kind === "AI" && messages[i - 1]?.mine !== false;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : "justify-start"}`}>
                  {!m.mine && activeRoom.kind === "AI" && <EviAvatar size={28} className={`self-start ${showAvatar ? "" : "invisible"}`} />}
                  <div className="min-w-0 max-w-[85%]">
                    {!m.mine && activeRoom.kind === "GROUP" && <span className="mb-0.5 ml-1 block text-xs text-[var(--muted)]">{m.senderName}</span>}
                    {renderAttachments(m)}
                    {m.content && <p className={`${m.mine ? ui.bubbleMe : ui.bubbleAiOnGray} max-w-none text-sm`}>{m.content}</p>}
                    <span className={`mt-1 block text-[11px] text-[var(--muted)] ${m.mine ? "text-right" : "text-left"}`}>{timeLabel(m.createdAt)}</span>
                  </div>
                </div>
              );
            })}
            {aiThinking && (
              <div className="flex items-start gap-2">
                <EviAvatar size={28} />
                <p className={`${ui.bubbleAiOnGray} inline-flex gap-1`} aria-label="답을 쓰는 중">
                  {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]" style={{ animationDelay: `${d}ms` }} />)}
                </p>
              </div>
            )}
          </div>

          {(pendingAtt.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--gray-100)] bg-white px-3 pt-2">
              {pendingAtt.map((a, i) =>
                a.kind === "image" ? (
                  <span key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.name} className="h-12 w-12 rounded-[var(--radius-md)] object-cover" />
                    <button onClick={() => setPendingAtt((prev) => prev.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gray-700)] text-white" aria-label="첨부 제거"><Icon name="close" size={10} /></button>
                  </span>
                ) : (
                  <span key={i} className={`${ui.badge} bg-[var(--gray-100)] text-[var(--gray-700)]`}>
                    {a.name}
                    <button onClick={() => setPendingAtt((prev) => prev.filter((_, j) => j !== i))} aria-label="첨부 제거"><Icon name="close" size={12} /></button>
                  </span>
                ),
              )}
              {uploading && <span className="px-2 py-1 text-xs text-[var(--muted)]">업로드 중…</span>}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex shrink-0 items-end gap-2 border-t border-[var(--gray-100)] bg-white p-3">
            <input ref={fileRef} type="file" multiple
              accept="image/*,.pdf,.txt,.csv,.tsv,.md,.json,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip,.7z,.rar"
              className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} className={`${iconBtn} h-11 w-11 shrink-0 bg-[var(--gray-100)]`} aria-label="파일 첨부" title="이미지·문서 첨부">
              <Icon name="attach" size={18} />
            </button>
            <textarea rows={1} value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData?.items ?? [])
                  .filter((it) => it.kind === "file")
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => f !== null);
                if (pasted.length > 0) {
                  e.preventDefault();
                  void handleFiles(pasted);
                }
              }}
              placeholder={activeRoom.kind === "AI" ? "Evi에게 물어보세요" : "메시지를 입력하세요"} aria-label="메시지"
              className={`${ui.field} min-h-11 flex-1 resize-none text-sm`} />
            <button type="submit" disabled={uploading || sending || aiThinking} className={ui.primary} aria-label="전송"><Icon name="send" size={16} /></button>
          </form>
        </div>
      )}
    </>
  );

  // 평가 화면이 Evi 평가 세션을 띄우면 창을 오른쪽 패널로 고정하고 Evi·메신저 탭으로 나눔
  if (dock) {
    return (
      // 상단 바(z-40) 아래에 둠: 알림·프로필 메뉴와 확인 대화상자가 패널 위로 열려야 함
      <aside aria-label="Evi와 메신저" className="fixed bottom-0 right-0 top-14 z-30 flex w-[440px] flex-col bg-white shadow-[var(--shadow-lg)]">
        <nav aria-label="창 구역" className="flex shrink-0 gap-1 px-3 pt-2 shadow-[inset_0_-1px_0_var(--gray-200)]">
          {([["bot", "Evi", 0], ["messenger", "메신저", unreadMessages]] as const).map(([id, label, count]) => (
            <button key={id} type="button" onClick={() => setDockTab(id)} aria-current={dockTab === id ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${dockTab === id ? "border-[var(--accent)] font-semibold" : "border-transparent text-[var(--gray-700)] hover:text-[var(--foreground)]"}`}>
              {id === "bot" ? <EviAvatar size={18} /> : <Icon name="users" size={15} />}{label}
              {count > 0 && <span className="ml-1 inline-block min-w-5 rounded-full bg-[var(--danger)] px-1.5 text-center text-xs font-semibold text-white">{count}</span>}
            </button>
          ))}
        </nav>
        <div ref={dockSlot} className={`min-h-0 flex-1 flex-col [&>section]:h-full [&>section]:min-h-0 [&>section]:rounded-none ${dockTab === "bot" ? "flex" : "hidden"}`} />
        {dockTab === "messenger" && <div className="flex min-h-0 flex-1 flex-col">{messenger}</div>}
      </aside>
    );
  }

  return (
    <>
      {!open && !inline && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--accent-dark)]"
          aria-label="Evi와 메신저 열기">
          <EviAvatar size={34} bare />
          {unreadMessages > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--danger)] px-1 text-xs font-semibold text-white">
              {unreadMessages > 99 ? "99+" : unreadMessages}
            </span>
          )}
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-[70] flex h-[min(82vh,640px)] w-[min(92vw,420px)] flex-col overflow-hidden rounded-[var(--radius-xl)] bg-white shadow-[var(--shadow-lg)]">
          {messenger}
        </div>
      )}
    </>
  );
}
