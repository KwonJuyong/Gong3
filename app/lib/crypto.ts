import crypto from "crypto";

/**
 * 주민등록번호 등 민감정보 암호화 유틸 (AES-256-GCM).
 * 키는 process.env.RRN_SECRET (32바이트, hex 64자 또는 base64).
 * 저장 형식: base64(iv):base64(tag):base64(ciphertext)
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.RRN_SECRET;
  if (!raw) {
    throw new Error("RRN_SECRET 환경변수가 설정되지 않았습니다.");
  }
  // hex(64자) 또는 base64 모두 허용. 길이로 판별.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error("RRN_SECRET 길이가 올바르지 않습니다. (32바이트 hex/base64 필요)");
  }
  return key;
}

export function encryptRRN(plain: string): string {
  const value = (plain || "").trim();
  if (!value) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptRRN(enc: string | null | undefined): string {
  if (!enc) return "";
  const parts = enc.split(":");
  if (parts.length !== 3) return "";
  const key = getKey();
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const ct = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString("utf8");
}

/** 표시용 마스킹: 901010-1****** */
export function maskRRN(plain: string): string {
  const digits = (plain || "").replace(/[^0-9]/g, "");
  if (digits.length < 7) return plain || "";
  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
}
