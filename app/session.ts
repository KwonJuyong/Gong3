// 세션 쿠키 정책(Web Crypto 기반, proxy·서버 액션 공용)
export const SESSION_COOKIE = "user_id";

export const SESSION_MAX_AGE = 60 * 60 * 2;
export const SESSION_MAX_AGE_PRIVILEGED = 60 * 60 * 24 * 7;
export const SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 12;
export const SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED = 60 * 60 * 24 * 30;
export const SESSION_TTL_CEILING = Math.max(SESSION_MAX_AGE, SESSION_MAX_AGE_PRIVILEGED);

export function sessionAbsoluteTtlFor(role: string | null | undefined): number {
  return role === "ADMIN" || role === "DEVELOPER"
    ? SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED
    : SESSION_ABSOLUTE_MAX_AGE;
}

export function absoluteTtlForTtl(ttl: number): number {
  return ttl === SESSION_MAX_AGE_PRIVILEGED
    ? SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED
    : SESSION_ABSOLUTE_MAX_AGE;
}

export function sessionTtlFor(role: string | null | undefined): number {
  return role === "ADMIN" || role === "DEVELOPER" ? SESSION_MAX_AGE_PRIVILEGED : SESSION_MAX_AGE;
}

export function cookieOptionsFor(ttlSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ttlSeconds,
    path: "/",
  };
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/dashboard")) return "/dashboard";
  if (next.includes("\\")) return "/dashboard";
  return next;
}

// 쿠키 형식: <userId>.<epoch>.<ttl>.<exp>.<abs>.<HMAC-SHA256>
const SEP = ".";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET 이 없거나 32자 미만입니다. 세션 쿠키를 서명할 수 없어 기동을 중단합니다. " +
        "`openssl rand -base64 48` 로 만들어 .env 와 docker-compose.yml 에 함께 넣으세요.",
    );
  }
  return "dev-only-insecure-session-secret-do-not-use-in-production";
}

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

function base64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(body: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await getKey(), new TextEncoder().encode(body));
  return base64url(mac);
}

export interface SessionPayload {
  userId: string;
  epoch: number;
  ttl: number;
  exp?: number;
  abs?: number;
}

export async function signSessionValue(
  userId: string,
  epoch: number,
  ttl: number,
  abs: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const body = [userId, epoch, ttl, exp, abs].join(SEP);
  return `${body}${SEP}${await sign(body)}`;
}

export function absoluteDeadline(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

// 서명·만료만 검증(DB의 sessionEpoch 대조는 getSessionUserId에서 수행)
export async function verifySessionValue(
  value: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!value) return null;

  const last = value.lastIndexOf(SEP);
  if (last <= 0) return null;

  const body = value.slice(0, last);
  const provided = value.slice(last + 1);
  if (!body || !provided) return null;

  if (!timingSafeEqual(provided, await sign(body))) return null;

  const parts = body.split(SEP);
  const userId = parts[0];
  if (!userId) return null;

  if (parts.length === 1) return { userId, epoch: 0, ttl: SESSION_MAX_AGE };

  const epoch = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(epoch) || epoch < 0) return null;

  if (parts.length === 2) return { userId, epoch, ttl: SESSION_MAX_AGE };

  if (parts.length !== 4 && parts.length !== 5) return null;

  const ttl = Number.parseInt(parts[2], 10);
  const exp = Number.parseInt(parts[3], 10);
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > SESSION_TTL_CEILING) return null;
  if (!Number.isInteger(exp) || exp <= 0) return null;

  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) return null;

  if (parts.length === 4) return { userId, epoch, ttl, exp };

  const abs = Number.parseInt(parts[4], 10);
  if (!Number.isInteger(abs) || abs <= 0) return null;
  if (abs <= now) return null;

  return { userId, epoch, ttl, exp, abs };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
