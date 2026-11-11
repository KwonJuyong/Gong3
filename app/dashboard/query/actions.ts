"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/app/db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";
import { runNaturalQuery } from "@/app/lib/nlQuery";
import { checkLlmQuota } from "@/app/lib/limits";
import type { QuerySpec } from "@/app/lib/queryEngine";

/** 자연어 조회 서버 액션. 세션·계정 상태를 확인하고, 권한 판정은 runQuery 가 역할 기준으로 함 */

export type QueryState = {
  ok: boolean;
  /** 되묻기·차단·오류 메시지 */
  message?: string;
  kind?: "data" | "clarify" | "blocked" | "error";
  question?: string;
  mode?: string;
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  truncated?: boolean;
  notes?: string[];
  /** 내보내기 때 서버가 다시 실행할 명세 */
  spec?: QuerySpec;
  /** 같은 질문을 다시 보내도 화면이 갱신되도록 매번 다른 값을 넣음 */
  at?: number;
};

export async function askDataAction(_prev: QueryState, formData: FormData): Promise<QueryState> {
  const userId = await getSessionUserId();
  if (!userId) redirectToLogin();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, status: true },
  });
  if (!me || me.status !== "ACTIVE") redirect("/");

  const question = String(formData.get("question") || "");
  // 질문마다 LLM 을 호출함. 도우미(sendAiMessage)와 한도를 함께 씀
  const rl = checkLlmQuota(me);
  if (rl) return { ok: false, kind: "error", message: rl, question, at: Date.now() };
  const out = await runNaturalQuery({ id: me.id, name: me.name, role: me.role }, question);
  const at = Date.now();

  if (out.kind !== "data") return { ok: false, kind: out.kind, message: out.message, question, at };

  return {
    ok: true,
    kind: "data",
    question: out.question,
    mode: out.result.mode,
    columns: out.result.columns,
    rows: out.result.rows,
    rowCount: out.result.rowCount,
    truncated: out.result.truncated,
    notes: out.result.notes,
    spec: out.spec,
    at,
  };
}
