import type { Informante } from "@prisma/client";
import { prisma } from "../../config/prisma";

/**
 * Busca un informante por wallet. Si no existe, lo crea.
 * El informante no requiere autenticación — se identifica solo
 * por su walletPublicKey.
 */
export async function buscarOCrearInformante(
  walletPublicKey: string,
): Promise<Informante> {
  return prisma.informante.upsert({
    where: { walletPublicKey },
    update: {},
    create: { walletPublicKey },
  });
}

export async function obtenerInformantePorWallet(
  walletPublicKey: string,
): Promise<Informante | null> {
  return prisma.informante.findUnique({
    where: { walletPublicKey },
  });
}
