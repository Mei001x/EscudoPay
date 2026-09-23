import type { Firma, RolVerificador } from "@prisma/client";
import { prisma } from "../../config/prisma";

export async function crearFirma(data: {
  casoId: string;
  verificadorId?: string;
  rol: RolVerificador;
  resultado: string;
  signedXDR?: string;
}): Promise<Firma> {
  return prisma.firma.create({
    data: {
      casoId: data.casoId,
      verificadorId: data.verificadorId ?? null,
      rol: data.rol,
      firmado: true,
      resultado: data.resultado,
      signedXDR: data.signedXDR ?? null,
      fecha: new Date(),
    },
  });
}

export async function obtenerFirmasPorCaso(casoId: string): Promise<Firma[]> {
  return prisma.firma.findMany({
    where: { casoId },
    orderBy: { createdAt: "asc" },
  });
}

export async function contarFirmasValidas(casoId: string): Promise<number> {
  return prisma.firma.count({
    where: {
      casoId,
      firmado: true,
      resultado: "APROBADO",
    },
  });
}

export async function existeFirmaPorRol(
  casoId: string,
  rol: RolVerificador,
): Promise<boolean> {
  const firma = await prisma.firma.findUnique({
    where: {
      casoId_rol: { casoId, rol },
    },
  });
  return firma !== null;
}
