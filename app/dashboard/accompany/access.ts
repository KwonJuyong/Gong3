import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/db";
import { getSessionUserId, redirectToLogin } from "@/app/session-server";

export async function scenarioViewer() {
  const id = await getSessionUserId();
  if (!id) redirectToLogin();
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!user) redirectToLogin();
  return user;
}

export function scenarioScope(user: {
  id: string;
  role: string;
}): Prisma.ProjectWhereInput {
  if (user.role === "ADMIN") return {};
  return {
    OR: [
      { creatorId: user.id },
      {
        status: { in: ["ACTIVE", "FINISHED"] },
        scenario: { publishedAt: { not: null } },
        enrollments: { some: { userId: user.id, status: "ACCEPTED" } },
      },
    ],
  };
}
