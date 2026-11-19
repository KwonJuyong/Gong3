import { prisma } from "../db";

export type PlatformStats = { rounds: number; people: number; paidTotal: number };

/**
 * 홈 실적. 회차는 응답이 있는 평가 수, 인원은 응답자·확정 노무비 청구자·과거 지급 기록 학번의 합집합,
 * 총액은 과거 지급 기록 + 확정 노무비 청구 + 지급 완료 보상(세전)
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const [rounds, responders, claimants, pastPeople, past, claims, rewards] = await Promise.all([
    prisma.project.count({ where: { responses: { some: {} } } }),
    prisma.user.findMany({ where: { responses: { some: {} } }, select: { studentId: true } }),
    prisma.user.findMany({ where: { laborClaims: { some: { status: "CONFIRMED" } } }, select: { studentId: true } }),
    prisma.pastPayment.findMany({ where: { studentId: { not: null } }, distinct: ["studentId"], select: { studentId: true } }),
    prisma.pastPayment.aggregate({ _sum: { amount: true } }),
    prisma.laborClaim.aggregate({ where: { status: "CONFIRMED" }, _sum: { totalAmount: true } }),
    prisma.reward.aggregate({ where: { status: "PAID" }, _sum: { grossAmount: true } }),
  ]);
  const people = new Set([...responders, ...claimants, ...pastPeople].map((r) => r.studentId));
  return {
    rounds,
    people: people.size,
    paidTotal: (past._sum.amount ?? 0) + (claims._sum.totalAmount ?? 0) + (rewards._sum.grossAmount ?? 0),
  };
}
