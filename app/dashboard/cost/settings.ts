// 비용 관리 설정 상수 + 읽기 헬퍼 (서버 액션 아님 → "use server" 붙이지 않음)
import { prisma } from "../../db";

export const BUDGET_KEY = "costBudgetTotal";

/** AppSetting에서 숫자 설정값 읽기 (없으면 fallback) */
export async function getCostSetting(key: string, fallback: number): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  const n = row?.value ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
