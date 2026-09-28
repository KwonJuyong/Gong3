/**
 * 세션 쿠키 자체 점검. 실행: npm run test:session
 *
 * 서명, 만료, 갱신 상한은 시간을 움직여 봐야 확인되므로 Date.now 를 바꿔 가며 검사한다.
 * 유휴 만료와 별도로 절대 만료가 있어야 한다(OWASP Session Management Cheat Sheet).
 * 상수는 복제하지 않고 원본 모듈에서 import 한다.
 */
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const {
  signSessionValue,
  verifySessionValue,
  absoluteDeadline,
  absoluteTtlForTtl,
  sessionTtlFor,
  sessionAbsoluteTtlFor,
  cookieOptionsFor,
  safeNext,
  SESSION_MAX_AGE,
  SESSION_MAX_AGE_PRIVILEGED,
  SESSION_ABSOLUTE_MAX_AGE,
  SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED,
  SESSION_TTL_CEILING,
} = await import("../app/session.ts");

let pass = 0;
let fail = 0;
const failures = [];

function t(id, label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ok   ${id}  ${label}`);
  } else {
    fail++;
    failures.push(`${id} ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${id}  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// 시간 조작. 초 단위로 앞으로 감는다.
const realNow = Date.now;
let offsetMs = 0;
Date.now = () => realNow() + offsetMs;
const advance = (seconds) => {
  offsetMs += seconds * 1000;
};
const resetClock = () => {
  offsetMs = 0;
};

const UID = "ckq1x2y3z0000abcdefghijkl"; // cuid 모양(점이 없어야 한다)

console.log("\n세션 쿠키 자체 점검\n");

// ── 1. 기본 왕복 ───────────────────────────────────────────────
{
  const abs = absoluteDeadline(3600);
  const v = await signSessionValue(UID, 7, 1800, abs);
  const s = await verifySessionValue(v);
  t("T-01", "정상 발급·검증 왕복", !!s && s.userId === UID && s.epoch === 7 && s.ttl === 1800,
    s ? `userId=${s.userId} epoch=${s.epoch} ttl=${s.ttl}` : "null");
  t("T-01b", "절대 만료가 그대로 실려 온다", !!s && s.abs === abs);
}

// ── 2. 위조 ────────────────────────────────────────────────────
{
  const v = await signSessionValue(UID, 0, 1800, absoluteDeadline(3600));
  const parts = v.split(".");

  const swapped = ["ckOTHERuser000000000000000", ...parts.slice(1)].join(".");
  t("T-02", "userId 를 바꿔치면 거부", (await verifySessionValue(swapped)) === null);

  const bumped = [parts[0], "999", ...parts.slice(2)].join(".");
  t("T-02b", "epoch 를 올리면 거부(서명 불일치)", (await verifySessionValue(bumped)) === null);

  const stretched = [parts[0], parts[1], String(SESSION_MAX_AGE), ...parts.slice(3)].join(".");
  t("T-02c", "ttl 을 늘리면 거부", (await verifySessionValue(stretched)) === null);

  const pushed = [...parts.slice(0, 3), String(Math.floor(Date.now() / 1000) + 99999), parts[4], parts[5]]
    .join(".");
  t("T-02d", "exp 를 미래로 밀면 거부", (await verifySessionValue(pushed)) === null);

  t("T-02e", "서명 없는 raw cuid 는 거부", (await verifySessionValue(UID)) === null);
  t("T-02f", "빈 값·쓰레기는 거부",
    (await verifySessionValue("")) === null && (await verifySessionValue("garbage")) === null);
}

// ── 3. ttl 상한 ────────────────────────────────────────────────
{
  // 서명은 유효하지만 ttl 이 상한을 넘는 값. 서버 코드가 만들 일은 없지만,
  // 상한 검사가 실제로 도는지 확인한다(넘으면 거부해야 한다).
  const v = await signSessionValue(UID, 0, SESSION_TTL_CEILING + 1, absoluteDeadline(3600));
  t("T-03", "ttl 이 상한을 넘으면 거부(서명이 유효해도)", (await verifySessionValue(v)) === null);

  /**
   * ttl 상한은 역할별 수명 중 큰 값이어야 한다. 기본 수명(SESSION_MAX_AGE)으로 두면
   * 관리자 쿠키가 발급 직후 거부된다.
   */
  const admin = await signSessionValue(
    UID, 0, sessionTtlFor("ADMIN"), absoluteDeadline(sessionAbsoluteTtlFor("ADMIN")));
  t("T-03b", "권한별 수명으로 발급한 쿠키는 상한에 걸리지 않는다(관리자·학생 모두)",
    (await verifySessionValue(admin)) !== null &&
      (await verifySessionValue(
        await signSessionValue(UID, 0, sessionTtlFor("USER"),
          absoluteDeadline(sessionAbsoluteTtlFor("USER"))))) !== null);
}

// ── 4. 유휴 만료 ───────────────────────────────────────────────
{
  resetClock();
  const v = await signSessionValue(UID, 0, 60, absoluteDeadline(86400));
  t("T-04", "유휴 만료 전에는 통과", (await verifySessionValue(v)) !== null);
  advance(61);
  t("T-04b", "유휴 만료 후에는 거부", (await verifySessionValue(v)) === null);
  resetClock();
}

// ── 5. 절대 만료: 갱신을 반복해도 밀리지 않는다 ─────────────────
//
// middleware 의 슬라이딩 갱신을 흉내 내 유휴 만료 직전마다 재서명한다.
// abs 를 갱신 때 다시 계산하면 끝나지 않으므로, 어느 시점에 반드시 끊겨야 한다.
{
  resetClock();
  const IDLE = 600; // 10분
  const ABS = 3600; // 1시간
  let value = await signSessionValue(UID, 0, IDLE, absoluteDeadline(ABS));

  let alive = 0;
  let died = false;
  for (let i = 0; i < 50; i++) {
    advance(IDLE - 30); // 유휴 만료 직전에 "활동"
    const s = await verifySessionValue(value);
    if (!s) {
      died = true;
      break;
    }
    alive++;
    // middleware 와 같이 abs 는 이어받고 exp 만 민다.
    value = await signSessionValue(s.userId, s.epoch, s.ttl, s.abs);
  }

  t("T-05", "갱신을 반복해도 절대 만료에서 끊긴다", died,
    died ? `${alive}회 갱신 후 종료` : "50회 갱신 동안 안 끊김 — 절대 만료가 무력하다");
  t("T-05b", "끊기기 전까지는 정상 동작(과잉 차단 아님)", alive >= 5, `갱신 ${alive}회`);
  resetClock();
}

// ── 6. 갱신이 abs 를 다시 계산하면 뚫린다 (역검증) ─────────────
//
// 틀린 구현이 실제로 뚫리는지 확인해 T-05 가 의미 있는 검사임을 보인다.
{
  resetClock();
  const IDLE = 600;
  const ABS = 3600;
  let value = await signSessionValue(UID, 0, IDLE, absoluteDeadline(ABS));

  let survived = 0;
  for (let i = 0; i < 20; i++) {
    advance(IDLE - 30);
    const s = await verifySessionValue(value);
    if (!s) break;
    survived++;
    // 틀린 구현: 갱신할 때마다 절대 만료를 다시 계산한다.
    value = await signSessionValue(s.userId, s.epoch, s.ttl, absoluteDeadline(ABS));
  }

  t("T-06", "abs 를 갱신 때 재계산하면 무한 연장된다(이 검사가 T-05 의 의미를 보증)",
    survived === 20, `${survived}회 생존`);
  resetClock();
}

// ── 7. 옛 형식 하위호환 ────────────────────────────────────────
//
// 배포 시점에 살아 있는 쿠키가 계속 통과하는지 본다.
{
  /**
   * 비밀은 app/session.ts 의 getSecret() 과 같은 규칙으로 고른다.
   * 환경에 SESSION_SECRET 이 있으면 그 값을 써야 앱과 같은 키로 서명된다.
   */
  const env = process.env.SESSION_SECRET;
  const SECRET =
    env && env.length >= 32 ? env : "dev-only-insecure-session-secret-do-not-use-in-production";
  const legacySign = (body) =>
    crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

  const twoPiece = `${UID}.${legacySign(UID)}`;
  const s2 = await verifySessionValue(twoPiece);
  t("T-07", "옛 형식 2조각(서명만)은 받아준다", !!s2 && s2.epoch === 0 && s2.ttl === SESSION_MAX_AGE,
    s2 ? `epoch=${s2.epoch} ttl=${s2.ttl}` : "null");

  const body3 = `${UID}.4`;
  const threePiece = `${body3}.${legacySign(body3)}`;
  const s3 = await verifySessionValue(threePiece);
  t("T-07b", "옛 형식 3조각(epoch 포함)은 받아준다", !!s3 && s3.epoch === 4,
    s3 ? `epoch=${s3.epoch}` : "null");

  t("T-07c", "옛 형식에는 절대 만료가 없다(middleware 가 채운다)",
    !!s2 && s2.abs === undefined && !!s3 && s3.abs === undefined);
}

// ── 8. 권한별 수명 ─────────────────────────────────────────────
{
  t("T-08", "관리자·개발사는 권한용 수명을 받는다",
    sessionTtlFor("ADMIN") === SESSION_MAX_AGE_PRIVILEGED &&
      sessionTtlFor("DEVELOPER") === SESSION_MAX_AGE_PRIVILEGED);
  t("T-08b", "그 외(학생·미상)는 기본 수명",
    sessionTtlFor("USER") === SESSION_MAX_AGE &&
      sessionTtlFor(null) === SESSION_MAX_AGE &&
      sessionTtlFor(undefined) === SESSION_MAX_AGE);
  t("T-08c", "절대 만료가 유휴보다 길다(즉시 끊기지 않는다) — 두 권한 모두",
    sessionAbsoluteTtlFor("ADMIN") > sessionTtlFor("ADMIN") &&
      sessionAbsoluteTtlFor("USER") > sessionTtlFor("USER"));
  t("T-08d", "ttl 로 절대 만료를 역산하면 원래 값이 나온다(middleware 경로)",
    absoluteTtlForTtl(sessionTtlFor("ADMIN")) === sessionAbsoluteTtlFor("ADMIN") &&
      absoluteTtlForTtl(sessionTtlFor("USER")) === sessionAbsoluteTtlFor("USER"));

  /**
   * 학생 수명이 관리자보다 짧아야 한다. 학생은 공용 PC 에서 접속하는 경우가 많고
   * 계정에 주민등록번호·계좌가 있다. 숫자는 바꿔도 되지만 부등호는 유지한다.
   */
  t("T-08e", "학생 유휴 수명 < 관리자 유휴 수명",
    sessionTtlFor("USER") < sessionTtlFor("ADMIN"),
    `학생 ${sessionTtlFor("USER")}s · 관리자 ${sessionTtlFor("ADMIN")}s`);
  t("T-08f", "학생 절대 만료 < 관리자 절대 만료",
    SESSION_ABSOLUTE_MAX_AGE < SESSION_ABSOLUTE_MAX_AGE_PRIVILEGED);
  t("T-08g", "학생 유휴 수명이 평가 한 번(2시간)을 담는다",
    sessionTtlFor("USER") >= 60 * 60 * 2,
    `${sessionTtlFor("USER") / 3600}시간`);
}

// ── 9. 쿠키 속성 ───────────────────────────────────────────────
{
  const o = cookieOptionsFor(1800);
  t("T-09", "httpOnly·sameSite·path·maxAge 가 정책대로",
    o.httpOnly === true && o.sameSite === "lax" && o.path === "/" && o.maxAge === 1800,
    JSON.stringify(o));
  // secure 는 NODE_ENV 에 따라 다르므로 값만 기록한다.
  console.log(`       (참고: secure=${o.secure} — 운영 빌드에서만 true)`);
}

// ── 10. 로그인 후 복귀 경로 (오픈 리다이렉트) ──────────────────
{
  t("T-10", "외부 오리진으로 새지 않는다",
    safeNext("//evil.example") === "/dashboard" &&
      safeNext("https://evil.example") === "/dashboard" &&
      safeNext("/dashboard\\@evil.example") === "/dashboard");
  t("T-10b", "정상 내부 경로는 보존", safeNext("/dashboard/settlement?tab=1") === "/dashboard/settlement?tab=1");
  t("T-10c", "빈 값은 기본 경로", safeNext(null) === "/dashboard" && safeNext("") === "/dashboard");
}

// ── 11. 무한 리다이렉트 회귀 ───────────────────────────────────
//
// middleware(Edge)는 서명과 만료만 보고, getSessionUserId() 는 DB epoch 까지 대조한다.
// 서명은 맞고 epoch 이 다르면 두 층의 판정이 엇갈려, 페이지가 "/" 로 보내면
// middleware 가 다시 "/dashboard" 로 보내는 루프가 된다.
// DB 없이 소스를 읽어, 세션 부재 시 /dashboard 아래에서 redirect("/") 를 쓰지 않는지 확인한다.
{
  const { readdirSync, readFileSync, statSync, existsSync } = await import("node:fs");

  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const full = path.join(dir, n);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  const sources = [...walk("app/dashboard"), "app/email-setup/page.tsx"].filter((f) =>
    f.endsWith(".ts") || f.endsWith(".tsx"));

  // 세션 부재 가드가 "/" 로 나가는 형태만 찾는다. 권한·상태 검사는 대상이 아니다.
  const BAD = /if \(!(userId|me|meId|userRaw)\) redirect\("\/"\)/;
  const offenders = sources.filter((f) => BAD.test(readFileSync(f, "utf8")));

  t("T-11", "세션 부재 가드가 `/` 로 나가지 않는다(루프 원인)", offenders.length === 0,
    offenders.join(", "));

  t("T-11b", "쿠키를 지우고 나가는 출구가 실제로 있다",
    existsSync("app/session-expired/route.ts") &&
      /cookies\.delete/.test(readFileSync("app/session-expired/route.ts", "utf8")));

  // 이 출구가 middleware matcher 에 들어가면 쿠키를 지우기 전에 다시 루프가 된다.
  // matcher 배열의 문자열만 검사한다(주석은 제외). matcher 를 못 찾으면 실패로 본다.
  const mwSrc = readFileSync("middleware.ts", "utf8");
  const arr = mwSrc.match(/matcher:\s*\[([\s\S]*?)\]/);
  const patterns = arr ? [...arr[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]) : [];
  t("T-11c", "출구 경로가 middleware matcher 밖에 있다",
    patterns.length > 0 && !patterns.some((x) => x.includes("session-expired")),
    patterns.length ? patterns.join(" ") : "middleware.ts 에서 matcher 배열을 못 찾았다");

  // 로그인 화면이 ?expired=1 을 읽어 만료 안내를 보여주는지 확인한다.
  t("T-11d", "로그인 화면이 만료 안내를 띄운다",
    /expired/.test(readFileSync("app/page.tsx", "utf8")));
}

Date.now = realNow;

console.log(`\n통과 ${pass} · 실패 ${fail}`);
if (fail > 0) {
  console.log("\n실패 목록:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
