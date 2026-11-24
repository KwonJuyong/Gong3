import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { decryptFile, encryptFile } from "./crypto";

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

// SIGNATURE·SEAL은 확정 청구서 참조 유지를 위해 교체하지 않고 누적
export const SINGLETON_KINDS: readonly AttachmentKind[] = ["ID_CARD", "BANKBOOK"];

export function isSingletonKind(kind: AttachmentKind): boolean {
  return SINGLETON_KINDS.includes(kind);
}

export const PRIVATE_UPLOAD_DIR =
  process.env.PRIVATE_UPLOAD_DIR ?? path.join(process.cwd(), "private-uploads");

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 4) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
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

export function makeStoredName(mime: string): string {
  return `${crypto.randomUUID()}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

export function isSafeStoredName(name: string): boolean {
  return /^[0-9a-f-]{36}\.(png|jpg|webp|pdf|bin)$/i.test(name);
}

export function attachmentPath(storedName: string): string {
  if (!isSafeStoredName(storedName)) throw new Error("잘못된 파일명입니다.");
  return path.join(/*turbopackIgnore: true*/ PRIVATE_UPLOAD_DIR, storedName);
}

export async function saveAttachmentFile(storedName: string, buf: Buffer): Promise<void> {
  await mkdir(PRIVATE_UPLOAD_DIR, { recursive: true });
  await writeFile(attachmentPath(storedName), encryptFile(buf));
}

export async function readAttachmentFile(storedName: string): Promise<Buffer> {
  return decryptFile(await readFile(/*turbopackIgnore: true*/ attachmentPath(storedName)));
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await unlink(attachmentPath(storedName));
  } catch {}
}

export function canAccessAttachment(
  me: { id: string; role: string },
  att: { ownerId: string },
): boolean {
  return att.ownerId === me.id || me.role === "ADMIN";
}

// PDF는 스크립트 실행 방지를 위해 attachment로 다운로드 강제
export function contentDisposition(mime: string, filename: string): string {
  const kind = mime === "application/pdf" ? "attachment" : "inline";
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
