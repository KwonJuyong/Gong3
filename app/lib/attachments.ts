/**
 * 민감 첨부(신분증·통장사본·서명·직인)의 저장·검증·권한.
 *
 * public/ 은 정적 서빙되어 인증을 거치지 않으므로 그 밖(PRIVATE_UPLOAD_DIR)에 저장하고,
 * GET /api/attachments/[id] 에서만 권한을 확인해 내준다. 컨테이너에서는 이 경로에 볼륨이 필요하다.
 * 형식은 확장자가 아니라 매직넘버로 확인한다.
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/** 첨부 종류. 화면·ZIP 폴더명이 이 라벨을 쓴다. */
export const ATTACHMENT_KINDS = {
  ID_CARD: "신분증",
  BANKBOOK: "통장사본",
  SIGNATURE: "전자서명",
  SEAL: "직인",
} as const;

export type AttachmentKind = keyof typeof ATTACHMENT_KINDS;

export function isAttachmentKind(v: string): v is AttachmentKind {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_KINDS, v);
}

/**
 * 한 벌만 두는 종류. 다시 올리면 이전 파일을 교체한다.
 * SIGNATURE·SEAL 은 제출된 청구서가 파일을 참조하므로 교체하지 않고 쌓는다.
 */
export const SINGLETON_KINDS: readonly AttachmentKind[] = ["ID_CARD", "BANKBOOK"];

export function isSingletonKind(kind: AttachmentKind): boolean {
  return SINGLETON_KINDS.includes(kind);
}

/** 저장 경로(public/ 밖). 로컬과 컨테이너 경로가 달라 환경변수로 둔다. */
export const PRIVATE_UPLOAD_DIR =
  process.env.PRIVATE_UPLOAD_DIR ?? path.join(process.cwd(), "private-uploads");

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

/** 매직넘버로 판별한 실제 형식. 확장자·`file.type` 은 믿지 않는다. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 4) {
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    // PDF: 25 50 44 46 2D  ("%PDF-")
    if (
      buf.length >= 5 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46 &&
      buf[4] === 0x2d
    ) {
      return "application/pdf";
    }
  }
  // WebP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 저장 파일명은 UUID. 원본 이름은 경로 조작·중복·인코딩 문제가 있어 쓰지 않는다. */
export function makeStoredName(mime: string): string {
  return `${crypto.randomUUID()}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

/** storedName 이 UUID 형식인지(경로 조작 방지). */
export function isSafeStoredName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(png|jpg|webp|pdf|bin)$/i.test(name);
}

export function attachmentPath(storedName: string): string {
  if (!isSafeStoredName(storedName)) throw new Error("잘못된 파일명입니다.");
  return path.join(PRIVATE_UPLOAD_DIR, storedName);
}

export async function saveAttachmentFile(storedName: string, buf: Buffer): Promise<void> {
  await mkdir(PRIVATE_UPLOAD_DIR, { recursive: true });
  await writeFile(attachmentPath(storedName), buf);
}

/** 디스크에서 지운다. 실패해도 DB 정리가 진행되도록 예외를 던지지 않는다. */
export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await unlink(attachmentPath(storedName));
  } catch {
    /* 이미 없거나 못 지움 — 무시 */
  }
}

/** 접근 규칙: 본인 또는 ADMIN */
export function canAccessAttachment(
  me: { id: string; role: string },
  att: { ownerId: string },
): boolean {
  return att.ownerId === me.id || me.role === "ADMIN";
}

/**
 * PDF 는 스크립트를 품을 수 있어 항상 다운로드로 내보낸다.
 * 이미지는 관리자가 화면에서 확인할 수 있도록 인라인으로 둔다.
 */
export function contentDisposition(mime: string, filename: string): string {
  const kind = mime === "application/pdf" ? "attachment" : "inline";
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
