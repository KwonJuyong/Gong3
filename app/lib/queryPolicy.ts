import "server-only";
import { getModelMeta, type FieldMeta, type ModelMeta } from "./queryMetadata";

/**
 * AI 도우미 조회 권한 정책. 판정은 모두 resolveAccess() 를 거침
 *
 * 1. DENIED_COLUMNS: 역할과 무관하게 막는 컬럼. 메타데이터에 실수로 실려도 막힘
 * 2. 모델 접근: adminOnly 모델
 * 3. 행 필터: rowFilterForNonAdmin
 */

export type Role = "USER" | "DEVELOPER" | "ADMIN";

/**
 * 역할과 무관하게(ADMIN 포함) 막는 컬럼. 관리자가 필요한 값은 정산 화면에서 봄
 * 컬럼 이름이 카멜케이스라 소문자로 바꿔 비교함
 */
export const DENIED_COLUMNS: ReadonlySet<string> = new Set([
  // 주민등록번호
  "rrn", "rrnenc", "residentnumber", "residentregistrationnumber", "ssn",
  // 비밀번호
  "password", "passwordhash", "passwd", "pwd", "resettoken", "tokenhash",
  // 계좌정보
  "accountnumber", "accountnumberenc", "bankname", "holdername", "account",
  // 접속지(IP)는 접속기록 화면에서만 조회함(도우미로 보면 열람 기록이 남지 않음).
  "lastseenip", "ip", "useragent",
]);

/** 컬럼 이름이 차단 대상인가 */
export function isDeniedColumn(name: string): boolean {
  return DENIED_COLUMNS.has(String(name).toLowerCase());
}

/** 역할별 정책. DEVELOPER 는 현재 USER 와 같음 */
const ROLE_POLICY: Record<Role, { adminModels: boolean; adminFields: boolean; rowFilter: boolean; id: string }> = {
  USER:      { adminModels: false, adminFields: false, rowFilter: true,  id: "role:USER" },
  DEVELOPER: { adminModels: false, adminFields: false, rowFilter: true,  id: "role:DEVELOPER" },
  ADMIN:     { adminModels: true,  adminFields: true,  rowFilter: false, id: "role:ADMIN" },
};

export function normalizeRole(raw: string | null | undefined): Role {
  const r = String(raw ?? "").toUpperCase();
  return r === "ADMIN" || r === "DEVELOPER" ? (r as Role) : "USER";
}

export function isAdminRole(role: Role): boolean {
  return role === "ADMIN";
}

export type AccessGranted = {
  ok: true;
  /** 감사 로그에 남길 정책 식별자 */
  policyId: string;
  meta: ModelMeta;
  /** 이 역할이 읽을 수 있는 필드 */
  fields: Map<string, FieldMeta>;
  /** 항상 AND 로 붙는 행 필터. 없으면 undefined */
  rowFilter?: Record<string, unknown>;
};

export type AccessDenied = { ok: false; policyId: string; reason: string };
export type AccessDecision = AccessGranted | AccessDenied;

/**
 * 이 역할이 이 모델을 어떻게 조회할 수 있는지 판정함
 *
 * 질의 실행 전에 판정하므로 거부되면 Prisma 호출이 일어나지 않음
 */
export function resolveAccess(role: Role, modelKey: string, userId?: string): AccessDecision {
  const pol = ROLE_POLICY[role];
  const meta = getModelMeta(modelKey);

  if (!meta) {
    return { ok: false, policyId: pol.id, reason: `알 수 없는 모델: ${modelKey || "(빈 값)"}` };
  }
  if (meta.adminOnly && !pol.adminModels) {
    return { ok: false, policyId: `${pol.id}/admin-only-model`, reason: `${meta.label}(${modelKey})은 관리자 전용입니다.` };
  }

  const fields = new Map<string, FieldMeta>();
  for (const [name, f] of Object.entries(meta.fields)) {
    // 차단 컬럼은 역할을 보기 전에 뺌
    if (isDeniedColumn(name)) continue;
    // ADMIN 전용 필드
    if (f.adminOnly && !pol.adminFields) continue;
    fields.set(name, f);
  }

  const filters: Record<string, unknown>[] = [];
  if (pol.rowFilter && meta.rowFilterForNonAdmin) filters.push(meta.rowFilterForNonAdmin);
  // 조회자 id 가 없으면 빈 id 로 묶어 아무 행도 돌려주지 않음(fail closed).
  if (pol.rowFilter && meta.ownerFilterForNonAdmin) filters.push(meta.ownerFilterForNonAdmin(userId ?? ""));

  return {
    ok: true,
    policyId: `${pol.id}/${modelKey}${filters.length > 0 ? "/row-filtered" : ""}`,
    meta,
    fields,
    rowFilter: filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { AND: filters },
  };
}

/**
 * 이 역할에게 이 필드 값을 어떻게 보여줄지 (마스킹).
 * 비관리자에게만 적용되며, 마스킹 대상이 아니면 값을 그대로 돌려줌
 */
export function maskValue(role: Role, f: FieldMeta, v: unknown): unknown {
  if (isAdminRole(role)) return v;
  return f.maskForNonAdmin ? f.maskForNonAdmin(v) : v;
}
