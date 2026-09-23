import type { Verificador } from "@prisma/client";
import { prisma } from "../../config/prisma";

// ── Verificador ──────────────────────────────────────────────

export async function buscarVerificadorPorCodigo(
  codigo: string,
): Promise<Verificador | null> {
  return prisma.verificador.findUnique({ where: { codigo } });
}

// ── RefreshToken ─────────────────────────────────────────────

export async function crearRefreshToken(data: {
  verificadorId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await prisma.refreshToken.create({ data });
}

export async function buscarRefreshTokenPorHash(
  tokenHash: string,
) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { verificador: true },
  });
}

export async function eliminarRefreshToken(tokenHash: string): Promise<void> {
  // No lanza si no existe — logout es idempotente
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
}

export async function eliminarRefreshTokensExpirados(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
