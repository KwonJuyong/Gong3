import "server-only";
import { prisma } from "@/app/db";
import type { LinkableOrder } from "./FundingFields";

/** 아직 평가에 연결되지 않은 발주(취소·환불 제외). 관리자는 전체, 그 외는 본인 발주만 */
export async function linkableOrdersFor(user: { id: string; role: string }): Promise<LinkableOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      projectId: null,
      status: { in: ["PENDING", "PAID"] },
      ...(user.role !== "ADMIN" ? { buyerId: user.id } : {}),
    },
    select: {
      id: true,
      orderNo: true,
      panelSize: true,
      rewardPerPerson: true,
      status: true,
      service: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    serviceName: o.service.name,
    panelSize: o.panelSize,
    rewardPerPerson: o.rewardPerPerson,
    paid: o.status === "PAID",
  }));
}
