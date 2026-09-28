"use server";

import { getSessionUserId } from "@/app/session-server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../db";
import { BUDGET_KEY } from "./settings";

const COST_PATH = "/dashboard/cost";

async function requireAdmin() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me || me.role !== "ADMIN") return null;
  return me;
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** 총 예산 저장 */
export async function saveBudget(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const amount = parseAmount(formData.get("budget"));
  if (amount == null) return;
  await prisma.appSetting.upsert({
    where: { key: BUDGET_KEY },
    update: { value: String(amount) },
    create: { key: BUDGET_KEY, value: String(amount) },
  });
  revalidatePath(COST_PATH);
}
