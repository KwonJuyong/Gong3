/**
 * 코드 표기 규칙 검사. 실행: npm run check:style (커밋 전 자동 실행)
 *
 * 사람이 리뷰에서 매번 잡기 어려운 항목만 기계로 막음
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOTS = ["app", "scripts", "prisma", "middleware.ts"];
const SKIP_DIRS = new Set(["node_modules", "migrations", "templates"]);

// 실명 원본 데이터라 문구를 고치지 않음
const SKIP_FILES = new Set(["prisma/seed.ts"]);
// 모델에 보내는 프롬프트, 제출 서식, 이 규칙 자체는 문자열 검사에서 뺌
const COPY_LOCKED = new Set([
  "app/lib/llmGenerate.ts",
  "app/lib/chatAgent.ts",
  "app/lib/chatTools.ts",
  "app/lib/nlQuery.ts",
  "app/lib/queryMetadata.ts",
  "app/lib/queryPolicy.ts",
  "app/dashboard/payroll/LaborClaimPdf.tsx",
  "scripts/check-style.mjs",
]);

// 기능을 가진 글리프: 별점, 체크 표시, 흐름 화살표.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2606}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const DIVIDER = /[─━═]{3,}|={5,}|-{5,}|\*{5,}/;
const LABEL_HEAD = /^\[[^\]\n{}]+\]\s/;
// 주석은 명사형 종결. 괄호·쌍점이 이어지는 문장도 봄
const SENTENCE_END = /([가-힣]*[가-힣])다(?=[.):(]|\s*(?:\*\/)?\s*$)/g;
const COPULA = /(?:이|아니|습니|합니|입니|됩니|하|되|있|없|같|않|많|좋)$/;
// 어미 목록 대신 받침으로 판정: 다 앞 글자의 ㄴ·ㅆ 받침, 그 밖의 서술형 어간
function verbalEnding(line) {
  for (const [, stem] of line.matchAll(SENTENCE_END)) {
    const final = (stem.charCodeAt(stem.length - 1) - 0xac00) % 28;
    if (final === 4 || final === 20 || COPULA.test(stem)) return `${stem}다`;
  }
  return null;
}
const NOUN_JSX_COMMENT = /^\s*\{\/\*\s*([^*\n]{1,18}?)\s*\*\/\}\s*$/;
const REASON_WORDS = /[다요함음]\.?$|않|금지|필수|때문|\(.*\)$|eslint/;

/** 늘리지 말 것. 줄일 때마다 함께 낮춤 */
const MAX_ANY = 0;
/** 이 줄 수를 넘는 새 파일 금지. 아래 파일은 분리 전까지 지금 크기를 넘기지 않음 */
const MAX_LINES = 900;
const OVERSIZED = { "app/dashboard/DashboardView.tsx": 2200, "app/page.tsx": 950 };

const problems = [];
const report = (file, line, msg) => problems.push(`${file}:${line}  ${msg}`);

function collect(p, out) {
  if (fs.statSync(p).isFile()) {
    if (/\.(tsx?|mjs)$/.test(p)) out.push(p.split(path.sep).join("/"));
    return out;
  }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (!SKIP_DIRS.has(e.name)) collect(path.join(p, e.name), out);
  }
  return out;
}

function check(file) {
  const src = fs.readFileSync(file, "utf8");
  const lineCount = src.split("\n").length;
  const limit = OVERSIZED[file] ?? MAX_LINES;
  if (lineCount > limit) report(file, 1, `파일이 ${lineCount}줄입니다(상한 ${limit}). 나눠 주세요.`);

  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const seen = new Set();

  const checkComment = (r) => {
    if (seen.has(r.pos)) return;
    seen.add(r.pos);
    const text = src.slice(r.pos, r.end);
    const body = text.replace(/^\/\*+|\*+\/$|^\/\//g, "").replace(/^\s*\*?\s*/, "");
    if (DIVIDER.test(body)) report(file, lineOf(r.pos), "장식 구분선 주석");
    if (LABEL_HEAD.test(body)) report(file, lineOf(r.pos), "[라벨] 머리표 주석");
    if (text.includes("—")) report(file, lineOf(r.pos), "주석의 줄표(—)");
    if (EMOJI.test(text)) report(file, lineOf(r.pos), "주석의 이모지");
    text.split("\n").forEach((l, i) => {
      const word = verbalEnding(l.replace(/`[^`]*`|"[^"]*"|「[^」]*」/g, ""));
      if (word) report(file, lineOf(r.pos) + i, `주석의 서술형 종결: ${word}`);
    });
  };

  const isCode = (n) => ts.isJsxText(n) || ts.isStringLiteralLike(n) ||
    [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(n.kind);

  let anyCount = 0;
  // 토큰까지 내려가야 catch 블록·JSX 중괄호 안의 주석도 보임. JSX 글자는 주석으로 읽지 않음
  (function visit(n) {
    if (n.kind !== ts.SyntaxKind.JsxText) {
      (ts.getLeadingCommentRanges(src, n.getFullStart()) ?? []).forEach(checkComment);
      (ts.getTrailingCommentRanges(src, n.getEnd()) ?? []).forEach(checkComment);
    }
    if (n.kind === ts.SyntaxKind.AnyKeyword) anyCount++;
    if (!COPY_LOCKED.has(file) && isCode(n)) {
      const t = n.getText(sf);
      const line = lineOf(n.getStart(sf));
      if (EMOJI.test(t)) report(file, line, "문자열의 이모지");
      if (file.startsWith("app/") && /\s—(\s|["'`]|$)/.test(t)) report(file, line, "화면 문구의 줄표(—)");
    }
    n.getChildren(sf).forEach(visit);
  })(sf);

  if (file.endsWith(".tsx")) {
    src.split("\n").forEach((l, i) => {
      const m = l.match(NOUN_JSX_COMMENT);
      if (m && !REASON_WORDS.test(m[1])) report(file, i + 1, `이름만 적은 JSX 주석: ${m[1]}`);
    });
  }
  return anyCount;
}

const files = ROOTS.flatMap((r) => collect(r, [])).filter((f) => !SKIP_FILES.has(f));
let anyTotal = 0;
for (const f of files) anyTotal += check(f);
if (anyTotal > MAX_ANY) problems.push(`any 타입 ${anyTotal}개(상한 ${MAX_ANY})`);

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\n표기 규칙 위반 ${problems.length}건.`);
  process.exit(1);
}
console.log(`표기 규칙 통과(${files.length}개 파일)`);
