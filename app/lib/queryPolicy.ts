import "server-only";
import { getModelMeta, type FieldMeta, type ModelMeta } from "./queryMetadata";

export type Role = "USER" | "DEVELOPER" | "ADMIN";

// 역할과 무관하게 차단하는 민감 컬럼(소문자 비교)
export const DENIED_COLUMNS: ReadonlySet<string> = new Set([
  "rrn", "rrnenc", "residentnumber", "residentregistrationnumber", "ssn",
  "password", "passwordhash", "passwd", "pwd", "resettoken", "tokenhash",
  "accountnumber", "accountnumberenc", "bankname", "holdername", "account",
  "lastseenip", "ip", "useragent",
]);

export function isDeniedColumn(name: string): boolean {
  return DENIED_COLUMNS.has(String(name).toLowerCase());
}

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
  policyId: string;
  meta: ModelMeta;
  fields: Map<string, FieldMeta>;
  rowFilter?: Record<string, unknown>;
};

export type AccessDenied = { ok: false; policyId: string; reason: string };
export type AccessDecision = AccessGranted | AccessDenied;

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
    if (isDeniedColumn(name)) continue;
    if (f.adminOnly && !pol.adminFields) continue;
    fields.set(name, f);
  }

  const filters: Record<string, unknown>[] = [];
  if (pol.rowFilter && meta.rowFilterForNonAdmin) filters.push(meta.rowFilterForNonAdmin);
  if (pol.rowFilter && meta.ownerFilterForNonAdmin) filters.push(meta.ownerFilterForNonAdmin(userId ?? ""));

  return {
    ok: true,
    policyId: `${pol.id}/${modelKey}${filters.length > 0 ? "/row-filtered" : ""}`,
    meta,
    fields,
    rowFilter: filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { AND: filters },
  };
}

export function maskValue(role: Role, f: FieldMeta, v: unknown): unknown {
  if (isAdminRole(role)) return v;
  return f.maskForNonAdmin ? f.maskForNonAdmin(v) : v;
}
