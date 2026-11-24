import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/db";

// 평가 행 잠금으로 기존 응답 확인·정원 확인·생성을 묶음. 학생당 응답 1건과 정원 유지
// (보상 정원은 createRewardForResponse 가 따로 지킴)
// tx 를 넘기면 호출한 쪽 트랜잭션 안에서 처리(기록 저장과 응답 생성을 함께 확정)
export async function saveResponse(projectId: string, userId: string, answers: Prisma.InputJsonValue, capacity: number, overwrite = true, client?: Prisma.TransactionClient) {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    const existing = await tx.response.findFirst({ where: { projectId, userId }, select: { id: true } });
    if (existing) {
      // 수정은 정원·보상에 영향 없음
      if (overwrite) await tx.response.update({ where: { id: existing.id }, data: { answers } });
      return { kind: "updated" as const };
    }
    const current = await tx.project.findUnique({ where: { id: projectId }, select: { closedAt: true } });
    const answered = await tx.response.count({ where: { projectId } });
    if (current?.closedAt || answered >= capacity) return { kind: "full" as const };
    const created = await tx.response.create({ data: { projectId, userId, answers }, select: { id: true } });
    // 정원이 차면 응답 마감
    if (answered + 1 >= capacity) {
      await tx.project.updateMany({ where: { id: projectId, closedAt: null }, data: { closedAt: new Date() } });
    }
    return { kind: "created" as const, responseId: created.id };
  };
  return client ? run(client) : prisma.$transaction(run);
}
