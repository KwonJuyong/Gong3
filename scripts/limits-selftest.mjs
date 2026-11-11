/**
 * 사용량 한도 자체 점검(DB 불필요). 실행: npm run test:limits
 *
 * 한도 값은 복제하지 않고 원본 모듈에서 읽음
 */
import path from "node:path";
import os from "node:os";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const { checkRateLimit, consumeQuota } = await import("../app/rate-limit.ts");
const L = await import("../app/lib/limits.ts");
const { toAgentTurn, attachmentTurnIndexes } = await import("../app/lib/chatAttachments.ts");

let pass = 0;
let fail = 0;
function t(id, name, ok) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${id}  ${name}`);
}
const times = (n, fn) => {
  let last = null;
  for (let i = 0; i < n; i++) last = fn();
  return last;
};

// 횟수 한도
t("L-01", "한도까지는 통과", times(3, () => checkRateLimit("t:a", 3, 1000)) === null);
t("L-02", "한도를 넘으면 안내 문구", typeof checkRateLimit("t:a", 3, 1000) === "string");
{
  const real = Date.now;
  checkRateLimit("t:b", 1, 1000);
  checkRateLimit("t:b", 1, 1000);
  Date.now = () => real() + 2000;
  t("L-03", "시간 창이 지나면 초기화", checkRateLimit("t:b", 1, 1000) === null);
  Date.now = real;
}
{
  const [max] = L.LIMIT_RULES.message;
  t("L-04", "메시지 한도 통과", times(max, () => L.checkLimit("message", "u1")) === null);
  t("L-05", "메시지 한도 초과", typeof L.checkLimit("message", "u1") === "string");
  t("L-06", "한도는 사용자별", L.checkLimit("message", "u2") === null);
}
{
  times(L.LLM_PER_DAY.USER, () => {
    // 분당 한도에 먼저 걸리지 않도록 시계를 미룸
    const real = Date.now;
    Date.now = () => real() + 61_000;
    const r = L.checkLlmQuota({ id: "s1", role: "USER" });
    Date.now = real;
    return r;
  });
  t("L-07", "학생은 하루 한도가 관리자보다 작다", L.LLM_PER_DAY.USER < L.LLM_PER_DAY.ADMIN);
  const real = Date.now;
  Date.now = () => real() + 61_000;
  t("L-08", "LLM 하루 한도 초과", typeof L.checkLlmQuota({ id: "s1", role: "USER" }) === "string");
  Date.now = real;
  t("L-09", "알 수 없는 역할은 학생 한도", L.checkLlmQuota({ id: "x1", role: "?" }) === null);
}
t("L-10", "사업자 조회 한도 통과", times(L.BIZ_LOOKUP_PER_DAY, () => L.checkBizLookupQuota("b1")) === null);
t("L-11", "사업자 조회 한도 초과", typeof L.checkBizLookupQuota("b1") === "string");

// 용량 한도
t("L-12", "용량 한도 이내 통과", consumeQuota("q:a", 60, 100, 1000) === false);
t("L-13", "누적이 한도를 넘으면 거절", consumeQuota("q:a", 60, 100, 1000) === true);
t("L-14", "거절된 양은 누적하지 않음", consumeQuota("q:a", 40, 100, 1000) === false);

// 첨부
const tmp = mkdtempSync(path.join(os.tmpdir(), "limits-"));
const cwd = process.cwd();
mkdirSync(path.join(tmp, "public", "uploads"), { recursive: true });
process.chdir(tmp);
const up = (name, body) => {
  writeFileSync(path.join(tmp, "public", "uploads", name), body);
  return { url: `/api/uploads/${name}`, name, kind: /\.(png|jpg)$/.test(name) ? "image" : "file" };
};
try {
  const small = up("a.png", Buffer.alloc(100));
  const big = up("b.png", Buffer.alloc(L.AI_IMAGE_MAX_BYTES + 1));
  const long = up("c.txt", "가".repeat(L.AI_FILE_MAX_CHARS * 3));
  const pdf = up("d.pdf", Buffer.alloc(100));

  const imgs = await toAgentTurn("q", [small, small, small, small, big], "user", true);
  const imgParts = imgs.content.filter((p) => p.type === "image_url");
  t("L-15", "이미지 장수 제한", imgParts.length === L.AI_IMAGES_PER_TURN);
  t("L-16", "초과 이미지는 이유를 글로 전달", imgs.content[0].text.includes("장까지만"));

  const bigOnly = await toAgentTurn("q", [big], "user", true);
  t("L-17", "큰 이미지는 읽지 않음", typeof bigOnly.content === "string" && bigOnly.content.includes("용량이 커서"));

  const txt = await toAgentTurn("", [long], "user", true);
  t("L-18", "텍스트 파일 글자 수 제한", txt.content.length < L.AI_FILE_MAX_CHARS + 50);
  const many = await toAgentTurn("", [long, long, long, long, long], "user", true);
  t("L-19", "한 메시지 파일 총량 제한", many.content.length < L.AI_TURN_FILE_MAX_CHARS + 400 && many.content.includes("읽지 않음"));

  const bin = await toAgentTurn("", [pdf], "user", true);
  t("L-20", "PDF 는 깨진 글자를 보내지 않음", bin.content.includes("읽을 수 없는 형식"));

  const old = await toAgentTurn("q", [small, long], "user", false);
  t("L-21", "오래된 첨부는 이름만", typeof old.content === "string" && old.content.includes("[이전 첨부: a.png]") && !old.content.includes("가가"));

  const trav = await toAgentTurn("q", [{ url: "/api/uploads/../../.env", name: "x", kind: "file" }], "user", true);
  t("L-22", "경로 탈출 차단", trav.content === "q");

  const idx = attachmentTurnIndexes([true, false, true, true, false, true]);
  t("L-23", "최근 첨부 메시지만 선택", idx.size === L.AI_ATTACHMENT_TURNS && idx.has(5) && idx.has(3) && !idx.has(2));
} finally {
  process.chdir(cwd);
  rmSync(tmp, { recursive: true, force: true });
}

// 기존 결정 고정
const genSrc = readFileSync("app/dashboard/services/actions.ts", "utf8");
t("L-24", "문항 생성에는 횟수 한도를 두지 않음", !/checkRateLimit|checkLimit|checkLlmQuota/.test(genSrc));
const llmSrc = readFileSync("app/lib/llmGenerate.ts", "utf8");
t("L-25", "문항 생성에 출력 토큰 상한을 두지 않음(대조군 유지)", !/max_completion_tokens|max_tokens/.test(llmSrc));
const profileSrc = readFileSync("app/dashboard/profile/actions.ts", "utf8");
t("L-26", "프로필 저장도 체크섬 다음에 조회 한도 확인", profileSrc.indexOf("isValidBizNo(bizNo)") < profileSrc.indexOf("checkBizLookupQuota(me.id)"));
const ordersSrc = readFileSync("app/dashboard/orders/actions.ts", "utf8");
const lookupFn = ordersSrc.slice(ordersSrc.indexOf("export async function lookupBizAction"));
t("L-27", "조회 액션도 체크섬 다음에 한도 확인", lookupFn.indexOf("isValidBizNo(bizNo)") < lookupFn.indexOf("checkBizLookupQuota(me.id)"));

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
