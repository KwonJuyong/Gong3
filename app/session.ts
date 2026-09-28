// 세션 쿠키 정책. middleware(Edge)와 서버 액션(Node) 양쪽에서 쓰므로 Node 전용 모듈을
// import 하지 않는다. 서명도 node:crypto 대신 Web Crypto 를 쓴다.

export const SESSION_COOKIE = "user_id";

// 세션 수명은 유휴 만료(슬라이딩)와 절대 만료 두 가지다.
// 학생은 공용 PC 에서 짧게 쓰고 계정에 주민번호·계좌가 있으므로 짧게, 관리자는 본인 기기만
// 쓰므로 길게 잡는다. 관리자도 노출 범위가 크므로 절대 만료는 둔다.
export const SESSION_MAX_AGE = 60 * 60 * 2; // 2h (학생)

/** 관리자·개발사의 유휴 수명. 쓰는 동안에는 슬라이딩으로 연장된다. */
export const SESSION_MAX_AGE_PRIVILEGED = 60 * 60 * 24 * 7; // 7d (관리자·개발사)

/**
 * 절대 만료. 슬라이딩 갱신만 있으면 탈취된 세션이 주기적 요청으로 영원히 살아남으므로,
 * 발급 시각 기준으로 활동과 무관한 상한을 둔다.
 */
export const SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 12; // 12h (학생)
export const SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED = 60 * 60 * 24 * 30; // 30d (관리자·개발사)

/** 쿠키에 실린 ttl 의 상한. 두 수명 중 큰 쪽이어야 관리자 쿠키가 거부되지 않는다. */
export const SESSION_TTL_CEILING = Math.max(SESSION_MAX_AGE, SESSION_MAX_AGE_PRIVILEGED);

/** 권한별 절대 만료(초). sessionTtlFor 와 함께 고친다. */
export function sessionAbsoluteTtlFor(role: string | null | undefined): number {
  return role === "ADMIN" || role === "DEVELOPER"
    ? SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED
    : SESSION_ABSOLUTE_MAX_AGE;
}

/**
 * 절대 만료가 없는 옛 쿠키를 갱신할 때 쓸 값.
 * middleware 는 role 을 모르므로 서명된 ttl 로 권한을 추정한다.
 */
export function absoluteTtlForTtl(ttl: number): number {
  return ttl === SESSION_MAX_AGE_PRIVILEGED
    ? SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED
    : SESSION_ABSOLUTE_MAX_AGE;
}

/**
 * 권한별 세션 수명(초).
 * Edge 에서도 로드되므로 @prisma/client 열거형 대신 문자열로 받는다.
 */
export function sessionTtlFor(role: string | null | undefined): number {
  return role === "ADMIN" || role === "DEVELOPER" ? SESSION_MAX_AGE_PRIVILEGED : SESSION_MAX_AGE;
}

/** 쿠키 옵션. maxAge 는 세션 ttl 과 같아야 한다. */
export function cookieOptionsFor(ttlSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ttlSeconds,
    path: "/",
  };
}

/**
 * 로그인 후 돌아갈 경로를 검증한다.
 * 오픈 리다이렉트를 막기 위해 보호 구간(/dashboard) 내부 경로만 허용하고,
 * 그 외에는 기본값 /dashboard로 되돌린다.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/dashboard")) return "/dashboard";
  // "/dashboard" 로 시작하되 다른 오리진으로 새는 형태(역슬래시 우회 등)는 거른다
  if (next.includes("\\")) return "/dashboard";
  return next;
}

// ─────────────────────────── 세션 값 서명 ───────────────────────────
//
// 쿠키 값: <userId>.<epoch>.<ttl>.<exp>.<abs>.<HMAC-SHA256>
//
// - userId 는 화면 데이터로 클라이언트에 나가므로 서명 없이는 다른 사람으로 위장할 수 있다.
// - epoch 은 User.sessionEpoch 와 대조해 세션을 개별 무효화하는 데 쓴다(Node 쪽에서 대조).
// - ttl 은 middleware 가 갱신할 때 role 을 볼 수 없어서 쿠키가 나른다.
// - exp·abs 를 서명 안에 둬야 만료를 서버가 강제할 수 있다.

const SEP = ".";

/**
 * 서명 키. 운영에서 없으면 throw 한다.
 * 빌드 시점에는 env 가 없으므로 모듈 로드가 아니라 첫 호출 때 검사한다.
 */
function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET 이 없거나 32자 미만입니다. 세션 쿠키를 서명할 수 없어 기동을 중단합니다. " +
        "`openssl rand -base64 48` 로 만들어 .env 와 docker-compose.yml 에 함께 넣으세요.",
    );
  }
  // 개발 편의용 고정값. 운영에서는 위에서 이미 throw 했다.
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
  // Edge 에는 Buffer 가 없으므로 btoa 를 쓴다.
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(body: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await getKey(), new TextEncoder().encode(body));
  return base64url(mac);
}

/** 검증된 세션 내용. `epoch` 는 발급 당시의 `User.sessionEpoch` 다. */
export interface SessionPayload {
  userId: string;
  epoch: number;
  /** 세션 수명(초). 로그인 때 권한으로 정해지고 갱신 때 그대로 이어 쓴다. */
  ttl: number;
  /** 유휴 만료 시각(unix 초). 갱신할 때마다 뒤로 밀린다. 옛 쿠키에는 없다. */
  exp?: number;
  /** 절대 만료 시각(unix 초). 갱신해도 밀리지 않는다. */
  abs?: number;
}

/** 쿠키에 넣을 서명된 값을 만든다. */
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

/** 지금부터 `seconds` 뒤의 절대 만료 시각. 로그인 시점에 한 번만 계산한다. */
export function absoluteDeadline(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

/**
 * 쿠키 값의 서명과 만료를 검증한다. 실패하면 null.
 *
 * epoch 이 DB 값과 같은지는 여기서 보지 않는다(Edge 에서 DB 를 못 읽는다).
 * 그 대조는 getSessionUserId() 가 하므로 이 함수만으로 인증된 것이 아니다.
 *
 * 서명 없는 값은 거부하고, 필드가 적은 이전 형식은 기본 수명으로 받아준다.
 */
export async function verifySessionValue(
  value: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!value) return null;

  // 서명은 항상 마지막 조각이다. cuid 에는 "." 이 없으므로 단순 분해로 충분하다.
  const last = value.lastIndexOf(SEP);
  if (last <= 0) return null;

  const body = value.slice(0, last);
  const provided = value.slice(last + 1);
  if (!body || !provided) return null;

  if (!timingSafeEqual(provided, await sign(body))) return null;

  const parts = body.split(SEP);
  const userId = parts[0];
  if (!userId) return null;

  // 이전 형식: <userId>
  if (parts.length === 1) return { userId, epoch: 0, ttl: SESSION_MAX_AGE };

  const epoch = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(epoch) || epoch < 0) return null;

  // 이전 형식: <userId>.<epoch>. 다음 요청에서 middleware 가 새 형식으로 다시 발급한다.
  // role 을 모르므로 기본(짧은) 수명으로 잡힌다.
  if (parts.length === 2) return { userId, epoch, ttl: SESSION_MAX_AGE };

  // 현행 형식은 5조각, 4조각은 abs 가 없는 이전 형식
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

/** 상수 시간 비교. Edge 에는 node:crypto 의 timingSafeEqual 이 없다. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
