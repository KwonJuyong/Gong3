"use server";

import { prisma, getSessionUser } from "@/app/db";
import { getSessionUserId } from "@/app/session-server";
import { publishToUser } from "@/app/lib/chatBus";
import { checkLimit, checkLlmQuota } from "@/app/lib/limits";
import { attachmentTurnIndexes, toAgentTurn } from "@/app/lib/chatAttachments";
import { runChatAgent, type ChatTurn } from "@/app/lib/chatAgent";
import { maskStudentId } from "@/app/lib/privacy";

export type RoomKind = "DM" | "GROUP" | "AI";

export type Attachment = {
  url: string;
  name: string;
  kind: "image" | "file";
  size?: number;
};

export type RoomSummary = {
  id: string;
  kind: RoomKind;
  title: string; // 화면 표시명 (DM=상대명, GROUP=방이름, AI=AI 도우미)
  avatarLabel: string; // 아바타 이니셜/이모지
  memberCount: number;
  lastContent: string;
  lastAt: string | null;
  unreadCount: number;
  pinned: boolean; // 상단 고정 여부
};

export type RoomMessage = {
  id: string;
  content: string;
  attachments: Attachment[];
  senderId: string | null; // null = AI/시스템
  senderName: string;
  isAI: boolean;
  mine: boolean;
  createdAt: string;
};

export type RoomDetail = {
  id: string;
  kind: RoomKind;
  title: string;
  members: { userId: string; name: string; studentId: string }[];
  /** 오래된 메시지가 잘렸는가 */
  truncated: boolean;
};

export type UserLite = { id: string; name: string; studentId: string; major: string };

function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    const name = typeof o.name === "string" ? o.name.slice(0, 200) : "첨부파일";
    const kind = o.kind === "image" ? "image" : "file";
    if (!url.startsWith("/api/uploads/")) continue;
    out.push({ url, name, kind, size: typeof o.size === "number" ? o.size : undefined });
  }
  return out;
}

function previewText(content: string, attachments: Attachment[]): string {
  if (content) return content;
  if (attachments.some((a) => a.kind === "image")) return "사진";
  if (attachments.length > 0) return "파일";
  return "";
}

const MAX_ATTACHMENTS = 10;
/** 방을 열 때 싣는 최근 메시지 수 */
const ROOM_MESSAGE_LIMIT = 200;
/** AI 에 넘기는 최근 대화 수. chatAgent 가 쓰는 맥락 길이와 맞춤(첨부를 디스크에서 다시 읽으므로 전체를 읽지 않음). */
const AI_HISTORY_LIMIT = 12;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 20;
const GROUP_MEMBER_LIMIT = 50;
// 붙여넣기 실수로 수 MB 짜리 본문이 저장·전송되지 않게 함
const MAX_CONTENT = 5000;
/** DM/GROUP 방의 표시명·아바타 계산 (상대는 나 이외 참여자 기준) */
function roomTitle(
  kind: RoomKind,
  title: string | null,
  others: { name: string }[],
): { title: string; avatarLabel: string } {
  if (kind === "AI") return { title: title || "AI 도우미", avatarLabel: "AI" };
  if (kind === "GROUP") {
    const t = title || others.map((o) => o.name).join(", ") || "그룹";
    return { title: t, avatarLabel: "그룹" };
  }
  const name = others[0]?.name || "(알 수 없음)";
  return { title: name, avatarLabel: name.charAt(0) };
}

/** 방별 안 읽은 메시지 수. 방마다 lastReadAt 이 달라 한 번에 세려면 조인이 필요함. senderId 가 null 인 AI 답변은 세지 않음 */
async function unreadByRoom(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT m."conversationId", COUNT(*)::int AS unread
    FROM "Message" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId"
    WHERE cm."userId" = ${userId}
      AND cm."leftAt" IS NULL
      AND m."senderId" <> ${userId}
      AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

export async function listRooms(): Promise<RoomSummary[]> {
  const me = await getSessionUser();
  if (!me) return [];

  const memberships = await prisma.conversationMember.findMany({
    where: { userId: me.id, leftAt: null },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  const unread = await unreadByRoom(me.id);
  const rows: { summary: RoomSummary; pinnedAt: Date | null; sortOrder: number }[] = [];
  for (const mem of memberships) {
    const conv = mem.conversation;
    const kind = conv.type as RoomKind;
    const others = conv.members
      .filter((m) => m.userId !== me.id)
      .map((m) => ({ name: m.user.name }));
    const { title, avatarLabel } = roomTitle(kind, conv.title, others);

    const last = conv.messages[0];
    const lastAtt = last ? parseAttachments(last.attachments) : [];

    rows.push({
      summary: {
        id: conv.id,
        kind,
        title,
        avatarLabel,
        memberCount: conv.members.filter((m) => m.leftAt === null).length,
        lastContent: last ? previewText(last.content, lastAtt) : "",
        lastAt: last ? last.createdAt.toISOString() : conv.createdAt.toISOString(),
        unreadCount: unread.get(conv.id) ?? 0,
        pinned: mem.pinnedAt !== null,
      },
      pinnedAt: mem.pinnedAt,
      sortOrder: mem.sortOrder,
    });
  }

  // 정렬: 고정 방 먼저(그 안에서 sortOrder 오름차순), 그다음 일반 방(최근 활동순 유지)
  rows.sort((a, b) => {
    const ap = a.pinnedAt !== null;
    const bp = b.pinnedAt !== null;
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) return a.sortOrder - b.sortOrder;
    return 0; // 둘 다 일반 → 쿼리의 updatedAt desc 순서 유지(안정 정렬)
  });

  return rows.map((r) => r.summary);
}

export async function getUnreadTotal(): Promise<number> {
  const userId = await getSessionUserId();
  if (!userId) return 0;
  let total = 0;
  for (const n of (await unreadByRoom(userId)).values()) total += n;
  return total;
}

async function assertMember(conversationId: string, userId: string) {
  return prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

export async function getRoom(
  conversationId: string,
): Promise<{ detail: RoomDetail; messages: RoomMessage[] } | null> {
  const me = await getSessionUser();
  if (!me || !conversationId) return null;

  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return null;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: { include: { user: { select: { id: true, name: true, studentId: true } } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: ROOM_MESSAGE_LIMIT + 1,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });
  if (!conv) return null;

  const kind = conv.type as RoomKind;
  const others = conv.members
    .filter((m) => m.userId !== me.id)
    .map((m) => ({ name: m.user.name }));
  const { title } = roomTitle(kind, conv.title, others);

  // 읽음 처리
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    data: { lastReadAt: new Date() },
  });

  const messages: RoomMessage[] = conv.messages.slice(0, ROOM_MESSAGE_LIMIT).reverse().map((m) => ({
    id: m.id,
    content: m.content,
    attachments: parseAttachments(m.attachments),
    senderId: m.senderId,
    senderName: m.senderId ? m.sender?.name || "알 수 없음" : "AI 도우미",
    isAI: m.senderId === null,
    mine: m.senderId === me.id,
    createdAt: m.createdAt.toISOString(),
  }));

  return {
    detail: {
      id: conv.id,
      kind,
      title,
      members: conv.members
        .filter((m) => m.leftAt === null)
        .map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          studentId: maskStudentId(m.user.studentId, me.role === "ADMIN"),
        })),
      truncated: conv.messages.length > ROOM_MESSAGE_LIMIT,
    },
    messages,
  };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: Attachment[],
): Promise<RoomMessage | { error: string } | null> {
  const me = await getSessionUser();
  if (!me || !conversationId) return null;

  const rl = checkLimit("message", me.id);
  if (rl) return { error: rl };

  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return null;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conv || conv.type === "AI") return null; // AI 방은 sendAiMessage 사용

  const text = (content || "").trim().slice(0, MAX_CONTENT);
  const clean = parseAttachments(attachments).slice(0, MAX_ATTACHMENTS);
  if (!text && clean.length === 0) return null;

  const msg = await prisma.message.create({
    data: {
      conversationId,
      senderId: me.id,
      content: text,
      attachments: clean.length > 0 ? clean : undefined,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // 참여중인 다른 멤버 + 내 다른 탭에 실시간 알림
  for (const m of conv.members) {
    if (m.leftAt) continue;
    publishToUser(m.userId, { type: "message", conversationId, senderId: me.id });
  }

  return {
    id: msg.id,
    content: msg.content,
    attachments: clean,
    senderId: me.id,
    senderName: me.name,
    isAI: false,
    mine: true,
    createdAt: msg.createdAt.toISOString(),
  };
}

export async function sendAiMessage(
  conversationId: string,
  content: string,
  attachments?: Attachment[],
): Promise<{ user: RoomMessage; assistant: RoomMessage } | { error: string } | null> {
  const me = await getSessionUser();
  if (!me || !conversationId) return null;

  const rl = checkLlmQuota(me);
  if (rl) return { error: rl };

  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return null;

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.type !== "AI") return null;

  const text = (content || "").trim().slice(0, MAX_CONTENT);
  const clean = parseAttachments(attachments).slice(0, MAX_ATTACHMENTS);
  if (!text && clean.length === 0) return null;

  // 사용자 메시지 저장
  const userMsg = await prisma.message.create({
    data: {
      conversationId,
      senderId: me.id,
      content: text,
      attachments: clean.length > 0 ? clean : undefined,
    },
  });

  const prior = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: AI_HISTORY_LIMIT,
  });
  const ordered = prior.reverse().map((m) => ({ ...m, files: parseAttachments(m.attachments) }));
  const withFiles = attachmentTurnIndexes(ordered.map((m) => !!m.senderId && m.files.length > 0));
  const history: ChatTurn[] = [];
  for (const [i, m] of ordered.entries()) {
    history.push(await toAgentTurn(m.content, m.files, m.senderId ? "user" : "assistant", withFiles.has(i)));
  }

  let reply: string;
  try {
    reply = await runChatAgent({ id: me.id, name: me.name, role: me.role }, history);
  } catch (e) {
    reply = `답변 생성 실패: ${(e as Error).message || "알 수 없는 오류"}`;
  }

  const aiMsg = await prisma.message.create({
    data: { conversationId, senderId: null, content: reply },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  // 다른 탭 동기화
  publishToUser(me.id, { type: "message", conversationId, senderId: null });

  const toRM = (m: { id: string; content: string; attachments: unknown; senderId: string | null; createdAt: Date }): RoomMessage => ({
    id: m.id,
    content: m.content,
    attachments: parseAttachments(m.attachments),
    senderId: m.senderId,
    senderName: m.senderId ? me.name : "AI 도우미",
    isAI: m.senderId === null,
    mine: m.senderId === me.id,
    createdAt: m.createdAt.toISOString(),
  });

  return { user: toRM(userMsg), assistant: toRM(aiMsg) };
}

export async function createDmRoom(otherUserId: string): Promise<string | null> {
  const me = await getSessionUser();
  if (!me || !otherUserId || otherUserId === me.id) return null;

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other || other.status !== "ACTIVE") return null;

  // 기존 DM 방 재사용
  const myDms = await prisma.conversationMember.findMany({
    where: { userId: me.id, conversation: { type: "DM" } },
    select: { conversationId: true },
  });
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DM",
      id: { in: myDms.map((m) => m.conversationId) },
      members: { some: { userId: otherUserId } },
    },
  });
  if (existing) {
    // 내가 나간 상태였다면 재입장
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: existing.id, userId: me.id } },
      data: { leftAt: null },
    });
    return existing.id;
  }

  if (checkLimit("roomCreate", me.id)) return null;

  const conv = await prisma.conversation.create({
    data: {
      type: "DM",
      createdById: me.id,
      members: { create: [{ userId: me.id }, { userId: otherUserId }] },
    },
  });
  return conv.id;
}

export async function createGroupRoom(
  title: string,
  memberIds: string[],
): Promise<string | null> {
  const me = await getSessionUser();
  if (!me || checkLimit("roomCreate", me.id)) return null;

  const others = Array.from(new Set((memberIds || []).filter((id) => id && id !== me.id))).slice(0, GROUP_MEMBER_LIMIT);
  if (others.length === 0) return null;

  // 실제 존재하는 유저만
  const valid = await prisma.user.findMany({
    where: { id: { in: others }, status: "ACTIVE" },
    select: { id: true },
  });
  const ids = valid.map((u) => u.id);
  if (ids.length === 0) return null;

  const conv = await prisma.conversation.create({
    data: {
      type: "GROUP",
      title: (title || "").trim().slice(0, 100) || null,
      createdById: me.id,
      members: { create: [{ userId: me.id }, ...ids.map((id) => ({ userId: id }))] },
    },
  });

  // 초대된 멤버 목록 갱신
  for (const id of ids) publishToUser(id, { type: "rooms" });
  return conv.id;
}

export async function createAiRoom(): Promise<string | null> {
  const me = await getSessionUser();
  if (!me) throw new Error("인증이 필요합니다.");
  if (checkLimit("roomCreate", me.id)) return null;
  const conv = await prisma.conversation.create({
    data: {
      type: "AI",
      title: "AI 도우미",
      createdById: me.id,
      members: { create: [{ userId: me.id }] },
    },
  });
  return conv.id;
}

export async function leaveRoom(conversationId: string): Promise<boolean> {
  const me = await getSessionUser();
  if (!me || !conversationId) return false;

  const mem = await assertMember(conversationId, me.id);
  if (!mem) return false;

  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    data: { leftAt: new Date() },
  });

  // 남은 멤버들 목록 갱신(그룹 인원 표시 등)
  const remaining = await prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null },
    select: { userId: true },
  });
  for (const m of remaining) publishToUser(m.userId, { type: "rooms" });

  // 아무도 안 남았으면 방·메시지 정리
  if (remaining.length === 0) {
    await prisma.conversation.delete({ where: { id: conversationId } });
  }
  return true;
}

export async function pinRoom(
  conversationId: string,
  pinned: boolean,
): Promise<boolean> {
  const me = await getSessionUser();
  if (!me || !conversationId) return false;
  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return false;

  if (pinned) {
    // 새로 고정하는 방을 고정 그룹 맨 위로: 기존 고정 방들의 최소 sortOrder - 1
    const top = await prisma.conversationMember.findFirst({
      where: { userId: me.id, leftAt: null, pinnedAt: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });
    const nextOrder = top ? top.sortOrder - 1 : 0;
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { pinnedAt: new Date(), sortOrder: nextOrder },
    });
  } else {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { pinnedAt: null },
    });
  }
  return true;
}

/** 고정 방들의 새 순서(위→아래 conversationId 배열)를 저장 */
export async function reorderPinnedRooms(orderedIds: string[]): Promise<boolean> {
  const me = await getSessionUser();
  if (!me || !Array.isArray(orderedIds)) return false;

  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.conversationMember.updateMany({
        where: { conversationId: id, userId: me.id, pinnedAt: { not: null } },
        data: { sortOrder: i },
      }),
    ),
  );
  return true;
}

/** 검색어가 있어야 조회함. 빈 검색으로 회원 명단을 훑을 수 없게 함 */
export async function searchUsers(query: string): Promise<{ users: UserLite[]; error?: string }> {
  const me = await getSessionUser();
  if (!me) return { users: [] };
  const q = (query || "").trim().slice(0, 100);
  if (q.length < SEARCH_MIN_LENGTH) return { users: [], error: `${SEARCH_MIN_LENGTH}글자 이상 입력해 주세요.` };

  const rl = checkLimit("userSearch", me.id);
  if (rl) return { users: [], error: rl };

  const users = await prisma.user.findMany({
    where: {
      id: { not: me.id },
      status: "ACTIVE",
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, studentId: true, major: true },
    orderBy: { name: "asc" },
    take: SEARCH_LIMIT,
  });
  const isAdmin = me.role === "ADMIN";
  return { users: users.map((u) => ({ ...u, studentId: maskStudentId(u.studentId, isAdmin) })) };
}
