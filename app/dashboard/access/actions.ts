"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "../../db";
import { prisma } from "../../db";
import { findAnomalies, purgeExpiredAccessLogs } from "../../lib/accessLog";
import { monthRange } from "./month";

const PATH = "/dashboard/access";

/**
 * 접속기록 월 점검 완료 기록(월 1회, month unique).
 * 이상 징후 건수는 점검 당시 값으로 저장함. 보관기간(25개월)이 지난 기록도 이때 파기함
 */
export async function recordAccessReviewAction(formData: FormData) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const month = String(formData.get("month") || "");
  const range = monthRange(month);
  if (!range) redirect(`${PATH}?tab=review&error=${encodeURIComponent("점검 월이 올바르지 않습니다.")}`);

  const exists = await prisma.accessReview.findUnique({ where: { month } });
  if (exists) redirect(`${PATH}?tab=review&month=${month}&error=${encodeURIComponent("이미 점검을 기록한 달입니다.")}`);

  const findings = await findAnomalies(range.from, range.to);
  const note = String(formData.get("note") || "").trim().slice(0, 1000) || null;
  await prisma.accessReview.create({
    data: { month, reviewerId: me.id, findings: findings.reduce((n, f) => n + f.rows.length, 0), note },
  });
  const purged = await purgeExpiredAccessLogs();

  revalidatePath(PATH);
  redirect(`${PATH}?tab=review&month=${month}&done=1&purged=${purged}`);
}
