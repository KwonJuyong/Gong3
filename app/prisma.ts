import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 싱글톤.
 * db.ts → session-server.ts → db.ts 순환을 피하려고 따로 뒀음. 이 파일에서는 앱 모듈을 import 하지 않음
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
