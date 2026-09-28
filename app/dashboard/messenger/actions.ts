"use server";

import { readFile } from "fs/promises";
import path from "path";
import { prisma, getSessionUser } from "@/app/db";
import { publishToUser } from "@/app/lib/chatBus";
import { checkRateLimit } from "@/app/rate-limit";
import { runChatAgent, type ChatTurn, type ChatContentPart } from "@/app/lib/chatAgent";
import { maskStudentId } from "@/app/lib/privacy";

// ─────────────────────────────── 타입 ───────────────────────────────
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
};

export type UserLite = { id: string; name: string; studentId: string; major: string };

// ────────────────────────────── 헬퍼 ──────────────────────────────
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    const name = typeof o.name === "string" ? o.name : "첨부파일";
    const kind = o.kind === "image" ? "image" : "file";
    if (!url.startsWith("/api/uploads/")) continue;
    out.push({ url, name, kind, size: typeof o.size === "number" ? o.size : undefined });
  }
  return out;
}

function previewText(content: string, attachments: Attachment[]): string {
  if (content) return content;
  if (attachments.some((a) => a.kind === "image")) return "📷 사진";
  if (attachments.length > 0) return "📎 파일";
  return "";
}

const MAX_ATTACHMENTS = 10;
const IMG_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

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

// ───────────────────────── 방 목록 ─────────────────────────
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

    const unreadCount = await prisma.message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: me.id },
        createdAt: mem.lastReadAt ? { gt: mem.lastReadAt } : undefined,
      },
    });

    rows.push({
      summary: {
        id: conv.id,
        kind,
        title,
        avatarLabel,
        memberCount: conv.members.filter((m) => m.leftAt === null).length,
        lastContent: last ? previewText(last.content, lastAtt) : "",
        lastAt: last ? last.createdAt.toISOString() : conv.createdAt.toISOString(),
        unreadCount,
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
  const rooms = await listRooms();
  return rooms.reduce((s, r) => s + r.unreadCount, 0);
}

// ───────────────────────── 방 열기(메시지 조회 + 읽음) ─────────────────────────
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
        orderBy: { createdAt: "asc" },
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

  const messages: RoomMessage[] = conv.messages.map((m) => ({
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
    },
    messages,
  };
}

// ───────────────────────── 메시지 전송 (DM/GROUP) ─────────────────────────
export async function sendMessage(
  conversationId: string,
  content: string,
  attachments?: Attachment[],
): Promise<RoomMessage | null> {
  const me = await getSessionUser();
  if (!me || !conversationId) return null;

  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return null;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conv || conv.type === "AI") return null; // AI 방은 sendAiMessage 사용

  const text = (content || "").trim();
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

// ───────────────────────── AI 방 전송 (에이전트 호출) ─────────────────────────
/** 저장된 메시지 → 에이전트 히스토리로 변환 (이미지=base64, 텍스트파일=본문 인라인) */
async function toAgentTurn(
  content: string,
  attachments: Attachment[],
  role: "user" | "assistant",
): Promise<ChatTurn> {
  if (role === "assistant") return { role, content };

  const parts: ChatContentPart[] = [];
  let text = content;
  for (const a of attachments) {
    const filename = a.url.replace("/api/uploads/", "");
    if (filename.includes("/") || filename.includes("..")) continue;
    const ext = (filename.split(".").pop() || "").toLowerCase();
    const fp = path.join(process.cwd(), "public", "uploads", filename);
    try {
      if (a.kind === "image" && IMG_MIME[ext]) {
        const buf = await readFile(fp);
        parts.push({
          type: "image_url",
          image_url: { url: `data:${IMG_MIME[ext]};base64,${buf.toString("base64")}` },
        });
      } else {
        const buf = await readFile(fp);
        text += `\n\n[첨부파일: ${a.name}]\n${buf.toString("utf-8").slice(0, 6000)}`;
      }
    } catch {
      text += `\n\n[첨부파일: ${a.name} — 열 수 없음]`;
    }
  }
  const finalText = text.trim() || "(첨부 파일을 확인해줘)";
  if (parts.length > 0) return { role, content: [{ type: "text", text: finalText }, ...parts] };
  return { role, content: finalText };
}

export async function sendAiMessage(
  conversationId: string,
  content: string,
  attachments?: Attachment[],
): Promise<{ user: RoomMessage; assistant: RoomMessage } | { error: string } | null> {
  const me = await getSessionUser();
  if (!me || !conversationId) return null;

  const rl = checkRateLimit(`chat:${me.id}`, 20, 60_000);
  if (rl) return { error: rl };

  const mem = await assertMember(conversationId, me.id);
  if (!mem || mem.leftAt) return null;

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.type !== "AI") return null;

  const text = (content || "").trim();
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

  // 히스토리 구성 (저장된 전체 대화)
  const prior = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  const history: ChatTurn[] = [];
  for (const m of prior) {
    history.push(
      await toAgentTurn(
        m.content,
        parseAttachments(m.attachments),
        m.senderId ? "user" : "assistant",
      ),
    );
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

// ───────────────────────── 방 생성 ─────────────────────────
export async function createDmRoom(otherUserId: string): Promise<string | null> {
  const me = await getSessionUser();
  if (!me || !otherUserId || otherUserId === me.id) return null;

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) return null;

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
  if (!me) return null;

  const others = Array.from(new Set((memberIds || []).filter((id) => id && id !== me.id)));
  if (others.length === 0) return null;

  // 실제 존재하는 유저만
  const valid = await prisma.user.findMany({
    where: { id: { in: others } },
    select: { id: true },
  });
  const ids = valid.map((u) => u.id);
  if (ids.length === 0) return null;

  const conv = await prisma.conversation.create({
    data: {
      type: "GROUP",
      title: (title || "").trim() || null,
      createdById: me.id,
      members: { create: [{ userId: me.id }, ...ids.map((id) => ({ userId: id }))] },
    },
  });

  // 초대된 멤버 목록 갱신
  for (const id of ids) publishToUser(id, { type: "rooms" });
  return conv.id;
}

export async function createAiRoom(): Promise<string> {
  const me = await getSessionUser();
  if (!me) throw new Error("인증이 필요합니다.");
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

// ───────────────────────── 방 나가기(나만) ─────────────────────────
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

// ───────────────────────── 상단 고정 / 순서 ─────────────────────────
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

// ───────────────────────── 사람 검색 (새 채팅) ─────────────────────────
export async function searchUsers(query: string): Promise<UserLite[]> {
  const me = await getSessionUser();
  if (!me) return [];
  const q = (query || "").trim();

  const users = await prisma.user.findMany({
    where: {
      id: { not: me.id },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { studentId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, studentId: true, major: true },
    orderBy: { name: "asc" },
    take: 30,
  });
  const isAdmin = me.role === "ADMIN";
  return users.map((u) => ({ ...u, studentId: maskStudentId(u.studentId, isAdmin) }));
}
