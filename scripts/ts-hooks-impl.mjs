/**
 * ts-hooks.mjs 가 등록하는 해석·적재 훅(테스트 전용).
 *
 * .ts 는 typescript 로 직접 변환한다. Node 내장 타입 스트리핑은 22.18 이상에서만 되므로
 * node:20 컨테이너에서도 돌게 하려는 것이다. typescript 가 없으면 Node 에 넘긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

let ROOT = process.cwd();

export function initialize(data) {
  if (data?.root) ROOT = data.root;
}

/** Next 런타임 밖에서는 존재하지 않는 모듈들의 스텁. */
const STUBS = {
  "next/headers": `
    export function cookies() {
      return { get: () => undefined, set: () => {}, delete: () => {} };
    }
    export function headers() { return new Map(); }
  `,
  "next/navigation": `
    export function redirect(u) { throw new Error("redirect(" + u + ")"); }
    export function notFound() { throw new Error("notFound()"); }
  `,
  "next/cache": `
    export function revalidatePath() {}
    export function revalidateTag() {}
  `,
};

const EXTS = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) {
    return { url: `stub:${specifier}`, shortCircuit: true, format: "module" };
  }

  let spec = specifier;
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href;
  }

  try {
    return await next(spec, context);
  } catch (err) {
    // 확장자 생략(./foo)을 처리한다.
    if (spec.startsWith(".") || spec.startsWith("file:")) {
      for (const ext of EXTS) {
        try {
          return await next(spec + ext, context);
        } catch {
          /* 다음 확장자 시도 */
        }
      }
    }
    throw err;
  }
}

/** `typescript` 는 있을 때만 쓴다. 훅 스레드에서 한 번만 불러온다. */
let tsPromise;
function loadTypeScript() {
  tsPromise ??= import("typescript").then((m) => m.default ?? m).catch(() => null);
  return tsPromise;
}

export async function load(url, context, next) {
  if (url.startsWith("stub:")) {
    return { format: "module", shortCircuit: true, source: STUBS[url.slice(5)] };
  }

  const filePart = url.split("?")[0];
  const isTs = filePart.endsWith(".ts") || filePart.endsWith(".tsx");
  if (isTs && !url.includes("/node_modules/")) {
    const ts = await loadTypeScript();
    if (ts) {
      const file = fileURLToPath(filePart);
      const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          // 타입 전용 import 는 런타임에 없으므로 지운다.
          verbatimModuleSyntax: false,
        },
      });
      return { format: "module", shortCircuit: true, source: outputText };
    }
  }

  return next(url, context);
}
