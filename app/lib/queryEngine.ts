import "server-only";
import { prisma } from "@/app/db";
import type { FieldMeta, FType } from "./queryMetadata";
import {
  resolveAccess,
  maskValue,
  isAdminRole,
  isDeniedColumn,
  normalizeRole,
  type Role,
} from "./queryPolicy";

/**
 * 동적 질의 엔진. LLM 이 만든 QuerySpec 을 검증하고 실행함
 * 메타데이터에 있는 모델·필드라면 코드 수정 없이 새 질의를 처리할 수 있음
 *
 * 읽기 전용은 구조로 보장함. Prisma delegate 의 count·groupBy·findMany·aggregate 만
 * 바인딩하고 raw 질의나 쓰기 메서드는 이 모듈에 두지 않음
 */

// 읽기 전용 델리게이트. 이 네 메서드 외에는 타입상으로도 접근할 수 없음
type ReadDelegate = {
  count: (a: unknown) => Promise<number>;
  groupBy: (a: unknown) => Promise<Array<Record<string, unknown>>>;
  findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>;
  aggregate: (a: unknown) => Promise<Record<string, unknown>>;
};

function readDelegate(modelKey: string): ReadDelegate | null {
  const d = (prisma as unknown as Record<string, ReadDelegate | undefined>)[modelKey];
  if (!d || typeof d.count !== "function") return null;
  return {
    count: d.count.bind(d),
    groupBy: d.groupBy.bind(d),
    findMany: d.findMany.bind(d),
    aggregate: d.aggregate.bind(d),
  };
}

// 결과 건수 상한

/** 목록 조회 1회 상한. 초과하면 자르고 안내를 함께 돌려줌 */
export const MAX_ROWS = 100;
/** 추이 집계를 위해 읽어올 수 있는 최대 행 수. 여기서 잘리면 결과에 표시함 */
export const MAX_SCAN_ROWS = 20000;

// where 정제: 화이트리스트 밖의 조건은 버림

function opsFor(type: FType): Set<string> {
  if (type === "string")
    return new Set(["equals", "not", "contains", "in", "startsWith", "endsWith"]);
  if (type === "boolean") return new Set(["equals", "not"]);
  return new Set(["equals", "not", "gt", "gte", "lt", "lte", "in"]);
}

function coerce(type: FType, v: unknown): unknown {
  if (v === null) return null;
  if (type === "int") {
    const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
    return Number.isNaN(n) ? undefined : n;
  }
  if (type === "float") {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isNaN(n) ? undefined : n;
  }
  if (type === "boolean") return typeof v === "boolean" ? v : String(v) === "true";
  if (type === "datetime") {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return String(v);
}

function buildFieldCond(type: FType, val: unknown): unknown {
  if (val === null) return { equals: null };
  if (Array.isArray(val))
    return { in: val.map((x) => coerce(type, x)).filter((x) => x !== undefined) };
  if (typeof val !== "object") {
    const c = coerce(type, val);
    return c === undefined ? undefined : { equals: c };
  }
  const ops = opsFor(type);
  const out: Record<string, unknown> = {};
  for (const [op, ov] of Object.entries(val as Record<string, unknown>)) {
    if (!ops.has(op)) continue;
    if (op === "in") {
      out.in = (Array.isArray(ov) ? ov : [ov])
        .map((x) => coerce(type, x))
        .filter((x) => x !== undefined);
    } else if (op === "contains" && type === "string") {
      out.contains = String(ov);
      out.mode = "insensitive";
    } else if (op === "not" && ov !== null && typeof ov === "object") {
      const nested = buildFieldCond(type, ov);
      if (nested && typeof nested === "object") {
        const n = { ...(nested as Record<string, unknown>) };
        delete n.mode; // Prisma NestedStringFilter 는 mode 미지원
        if (Object.keys(n).length) out.not = n;
      }
    } else {
      const c = coerce(type, ov);
      if (c !== undefined) out[op] = c;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * where 절을 화이트리스트로 정제함
 * DB 없이 테스트하려고 export 함(scripts/query-selftest.mjs). 앱 코드는 runQuery 를 씀
 */
export function sanitizeWhere(
  fields: Map<string, FieldMeta>,
  relations: Set<string>,
  raw: unknown,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || depth > 4) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "OR" || k === "AND") {
      const arr = Array.isArray(v) ? v : [v];
      const subs = arr
        .map((s) => sanitizeWhere(fields, relations, s, depth + 1))
        .filter((o) => Object.keys(o).length);
      if (subs.length) out[k] = subs;
      continue;
    }
    if (k === "NOT") {
      const sub = sanitizeWhere(fields, relations, v, depth + 1);
      if (Object.keys(sub).length) out[k] = sub;
      continue;
    }
    // 차단 컬럼은 조건으로도 쓸 수 없음(where 로 한 자리씩 추측할 수 있으므로).
    if (isDeniedColumn(k)) continue;
    const f = fields.get(k);
    if (f) {
      const cond = buildFieldCond(f.type, v);
      if (cond !== undefined) out[k] = cond;
      continue;
    }
    if (relations.has(k)) {
      if (v === "some" || v === true) out[k] = { some: {} };
      else if (v === "none" || v === false) out[k] = { none: {} };
      continue;
    }
    // 화이트리스트 밖(민감 컬럼 포함)은 조용히 무시
  }
  return out;
}

// 질의 명세

export type QueryMode = "count" | "list" | "groupBy" | "crosstab" | "trend" | "aggregate";
export type MetricFn = "count" | "sum" | "avg" | "min" | "max";
export type Interval = "day" | "week" | "month";

export type QuerySpec = {
  model: string;
  mode?: QueryMode;
  where?: unknown;
  groupBy?: string;
  /** 교차분석의 두 번째 기준 */
  groupBy2?: string;
  fields?: string[];
  take?: number;
  orderBy?: { field?: unknown; direction?: unknown };
  /** 집계 함수 */
  metric?: { fn?: unknown; field?: unknown };
  /** 기간별 추이 */
  interval?: Interval;
  dateField?: string;
};

export type QueryOk = {
  ok: true;
  model: string;
  mode: QueryMode;
  /** 감사 로그용 조회 대상("모델.필드,필드") */
  target: string;
  /** 감사 로그용 정책 식별자 */
  policy: string;
  rowCount: number;
  /** 상한에 걸려 잘렸는가 */
  truncated: boolean;
  /** 사용자에게 보일 안내(절단·마스킹 등) */
  notes: string[];
  /** 표 머리글 (내보내기·화면 공용) */
  columns: string[];
  /** 표 본문 */
  rows: Array<Record<string, unknown>>;
  /** 단일 스칼라 결과(count/aggregate) */
  scalar?: number | Record<string, unknown>;
};

export type QueryFail = { ok: false; policy: string; reason: string };
export type QueryOutput = QueryOk | QueryFail;

const KST = "Asia/Seoul";
export function fmtKst(d: unknown): unknown {
  return d instanceof Date ? d.toLocaleString("ko-KR", { timeZone: KST }) : d;
}

/** 날짜를 KST 기준 버킷 키로. week 는 그 주 월요일. */
function bucketKey(d: Date, interval: Interval): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000); // UTC → KST
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  if (interval === "month") return `${y}-${m}`;
  if (interval === "week") {
    const dow = (kst.getUTCDay() + 6) % 7; // 월=0
    const mon = new Date(kst.getTime() - dow * 86400000);
    return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, "0")}-${String(mon.getUTCDate()).padStart(2, "0")}`;
  }
  return `${y}-${m}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function asObj(v: unknown): unknown {
  if (v && typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

// 실행

/**
 * 질의를 검증하고 실행함
 *
 * 권한 판정(resolveAccess)은 Prisma 호출 전에 끝나므로 거부되면 DB 에 닿지 않음
 */
export async function runQuery(roleRaw: string, spec: QuerySpec, userId?: string): Promise<QueryOutput> {
  const role: Role = normalizeRole(roleRaw);
  const modelKey = String(spec.model || "");

  const access = resolveAccess(role, modelKey, userId);
  if (!access.ok) return { ok: false, policy: access.policyId, reason: access.reason };

  const delegate = readDelegate(modelKey);
  if (!delegate)
    return { ok: false, policy: access.policyId, reason: `모델 델리게이트를 찾을 수 없습니다: ${modelKey}` };

  const { fields, meta, rowFilter, policyId } = access;
  const relations = new Set(Object.keys(meta.relations ?? {}));
  const notes: string[] = [];

  // 비관리자 행 필터는 사용자 where 와 AND 로 묶음(spread 로 합치면 덮어쓸 수 있음).
  const sanitized = sanitizeWhere(fields, relations, asObj(spec.where));
  const where = rowFilter ? { AND: [rowFilter, sanitized] } : sanitized;
  const mode: QueryMode = (spec.mode as QueryMode) || "list";

  if (!isAdminRole(role)) notes.push("민감정보(연락처·계좌·비밀번호·주민번호)는 제외됩니다.");

  const base = { model: modelKey, mode, policy: policyId, truncated: false, notes } as const;

  // ---- count ----
  if (mode === "count") {
    const n = await delegate.count({ where });
    return { ...base, ok: true, target: modelKey, rowCount: 1, columns: ["건수"], rows: [{ 건수: n }], scalar: n };
  }

  // ---- aggregate: sum/avg/min/max ----
  if (mode === "aggregate") {
    const fn = String(spec.metric?.fn || "count") as MetricFn;
    const fieldName = spec.metric?.field ? String(spec.metric.field) : "";
    if (fn === "count") {
      const n = await delegate.count({ where });
      return { ...base, ok: true, target: modelKey, rowCount: 1, columns: ["건수"], rows: [{ 건수: n }], scalar: n };
    }
    const f = fields.get(fieldName);
    if (!f) return { ok: false, policy: policyId, reason: `집계할 수 없는 필드입니다: ${fieldName || "(빈 값)"}` };
    if (f.type !== "int" && f.type !== "float")
      return { ok: false, policy: policyId, reason: `${f.label} 은(는) 숫자 필드가 아니라 ${fn} 집계를 할 수 없습니다.` };
    const key = `_${fn}` as const;
    const res = await delegate.aggregate({ where, [key]: { [fieldName]: true } });
    const val = (res[key] as Record<string, unknown> | undefined)?.[fieldName] ?? null;
    const label = `${f.label} ${fn}`;
    return {
      ...base, ok: true, target: `${modelKey}.${fieldName}`, rowCount: 1,
      columns: [label], rows: [{ [label]: val }], scalar: Number(val ?? 0),
    };
  }

  // ---- groupBy ----
  if (mode === "groupBy") {
    const field = String(spec.groupBy || "");
    const f = fields.get(field);
    if (!f) return { ok: false, policy: policyId, reason: `집계 기준 필드가 유효하지 않습니다: ${field || "(빈 값)"}` };
    if (!isAdminRole(role) && f.maskForNonAdmin)
      return { ok: false, policy: policyId, reason: `${f.label} 로는 집계할 수 없습니다.` };

    const rows = await delegate.groupBy({ by: [field], where, _count: { _all: true } });
    const groups = rows
      .map((r) => ({ [f.label]: fmtKst(r[field]), 건수: (r._count as { _all: number })._all }))
      .sort((a, b) => (b.건수 as number) - (a.건수 as number));
    return { ...base, ok: true, target: `${modelKey}.${field}`, rowCount: groups.length, columns: [f.label, "건수"], rows: groups };
  }

  // ---- crosstab: 두 기준 교차분석 ----
  if (mode === "crosstab") {
    const f1n = String(spec.groupBy || "");
    const f2n = String(spec.groupBy2 || "");
    const f1 = fields.get(f1n);
    const f2 = fields.get(f2n);
    if (!f1 || !f2)
      return { ok: false, policy: policyId, reason: `교차분석 기준 두 개가 모두 필요합니다 (받은 값: ${f1n || "-"}, ${f2n || "-"}).` };
    if (!isAdminRole(role) && (f1.maskForNonAdmin || f2.maskForNonAdmin))
      return { ok: false, policy: policyId, reason: "마스킹 대상 필드로는 교차분석을 할 수 없습니다." };

    const raw = await delegate.groupBy({ by: [f1n, f2n], where, _count: { _all: true } });
    // 두 번째 기준의 값들을 열로 폄
    const colVals = [...new Set(raw.map((r) => String(fmtKst(r[f2n]) ?? "(없음)")))].sort();
    const byRow = new Map<string, Record<string, unknown>>();
    for (const r of raw) {
      const rk = String(fmtKst(r[f1n]) ?? "(없음)");
      const ck = String(fmtKst(r[f2n]) ?? "(없음)");
      const cnt = (r._count as { _all: number })._all;
      if (!byRow.has(rk)) {
        const init: Record<string, unknown> = { [f1.label]: rk };
        for (const c of colVals) init[c] = 0;
        init["합계"] = 0;
        byRow.set(rk, init);
      }
      const row = byRow.get(rk)!;
      row[ck] = (Number(row[ck]) || 0) + cnt;
      row["합계"] = (Number(row["합계"]) || 0) + cnt;
    }
    const out = [...byRow.values()].sort((a, b) => Number(b["합계"]) - Number(a["합계"]));
    return {
      ...base, ok: true, target: `${modelKey}.${f1n},${f2n}`, rowCount: out.length,
      columns: [f1.label, ...colVals, "합계"], rows: out,
    };
  }

  // ---- trend: 기간별 추이 ----
  if (mode === "trend") {
    const interval: Interval = spec.interval === "week" || spec.interval === "month" ? spec.interval : "day";
    const dateFieldName = String(spec.dateField || meta.dateField || "");
    const df = fields.get(dateFieldName);
    if (!df || df.type !== "datetime")
      return { ok: false, policy: policyId, reason: `기간 추이에 쓸 날짜 필드가 없습니다: ${dateFieldName || "(지정 안 됨)"}` };

    // Prisma groupBy 로는 날짜 절단을 할 수 없고 raw SQL 은 쓰지 않으므로,
    // 날짜 컬럼만 읽어 JS 에서 묶음. 읽는 행 수에 상한을 두고 잘리면 알림
    const scan = await delegate.findMany({
      where,
      select: { [dateFieldName]: true },
      take: MAX_SCAN_ROWS + 1,
      orderBy: { [dateFieldName]: "asc" },
    });
    const truncated = scan.length > MAX_SCAN_ROWS;
    const used = truncated ? scan.slice(0, MAX_SCAN_ROWS) : scan;
    if (truncated)
      notes.push(`대상이 ${MAX_SCAN_ROWS.toLocaleString()}건을 넘어 앞부분만 집계했습니다. 기간을 좁혀 다시 물어보세요.`);

    const buckets = new Map<string, number>();
    for (const r of used) {
      const v = r[dateFieldName];
      if (!(v instanceof Date)) continue;
      const k = bucketKey(v, interval);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const label = { day: "일자", week: "주(시작일)", month: "월" }[interval];
    const rows = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => ({ [label]: k, 건수: n }));
    return { ...base, ok: true, target: `${modelKey}.${dateFieldName}`, rowCount: rows.length, truncated, columns: [label, "건수"], rows };
  }

  // ---- list ----
  let sel = Array.isArray(spec.fields) ? spec.fields.map(String).filter((f) => fields.has(f)) : [];
  if (!sel.length) sel = [...fields.keys()].slice(0, 6);

  const select: Record<string, unknown> = {};
  for (const f of sel) select[f] = true;
  const rels = Object.keys(meta.relations ?? {});
  if (rels.length) select._count = { select: Object.fromEntries(rels.map((r) => [r, true])) };

  const requested = Math.max(1, Number(spec.take) || 20);
  const take = Math.min(requested, MAX_ROWS);
  if (requested > MAX_ROWS) notes.push(`한 번에 최대 ${MAX_ROWS}건까지만 보여줍니다.`);

  let orderBy: Record<string, string> | undefined;
  const ob = asObj(spec.orderBy) as { field?: unknown; direction?: unknown } | undefined;
  if (ob && fields.has(String(ob.field)))
    orderBy = { [String(ob.field)]: ob.direction === "asc" ? "asc" : "desc" };

  // 상한 초과 여부를 알기 위해 한 건 더 읽음
  const raw = await delegate.findMany({ where, select, take: take + 1, orderBy });
  const truncated = raw.length > take;
  if (truncated) notes.push(`결과가 ${take}건을 넘어 잘라서 보여줍니다. 조건을 좁히면 전체를 볼 수 있습니다.`);

  const columns: string[] = [];
  for (const f of sel) columns.push(fields.get(f)!.label);
  for (const r of rels) columns.push(`${meta.relations![r]} 수`);

  const rows = raw.slice(0, take).map((row) => {
    const o: Record<string, unknown> = {};
    for (const f of sel) {
      const meta2 = fields.get(f)!;
      o[meta2.label] = fmtKst(maskValue(role, meta2, row[f]));
    }
    const c = row._count as Record<string, number> | undefined;
    if (c) for (const [k, n] of Object.entries(c)) o[`${meta.relations?.[k] ?? k} 수`] = n;
    return o;
  });

  return { ...base, ok: true, target: `${modelKey}.${sel.join(",")}`, rowCount: rows.length, truncated, columns, rows };
}
