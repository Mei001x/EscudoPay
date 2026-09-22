import { prisma } from "../../config/prisma";

export type HealthResult = {
  status: "ok";
  db: "connected";
};

export async function checkHealth(): Promise<HealthResult> {
  await prisma.$queryRaw`SELECT 1`;

  return {
    status: "ok",
    db: "connected",
  };
}