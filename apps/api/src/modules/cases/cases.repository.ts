import type { EstadoCaso, Caso } from "@prisma/client";
import { prisma } from "../../config/prisma";

export async function crearCaso(data: {
  informanteId: string;
  delitoTipo: string;
  descripcion: string;
  evidenciaHash: string;
  montoRecompensaSugerido: number;
}): Promise<Caso> {
  return prisma.caso.create({
    data: {
      informanteId: data.informanteId,
      delitoTipo: data.delitoTipo as any,
      descripcion: data.descripcion,
      evidenciaHash: data.evidenciaHash,
      montoRecompensaSugerido: data.montoRecompensaSugerido,
      status: "RECIBIDO",
    },
  });
}

export async function obtenerCasoPorId(id: string): Promise<Caso | null> {
  return prisma.caso.findUnique({
    where: { id },
    include: {
      firmas: true,
      stellarTransaction: true,
      informante: {
        select: { walletPublicKey: true },
      },
    },
  }) as any;
}

export async function listarCasos(filtroStatus?: EstadoCaso): Promise<Caso[]> {
  return prisma.caso.findMany({
    where: filtroStatus ? { status: filtroStatus } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      firmas: true,
    },
  }) as any;
}

export async function actualizarEstadoCaso(
  id: string,
  nuevoEstado: EstadoCaso,
): Promise<Caso> {
  return prisma.caso.update({
    where: { id },
    data: { status: nuevoEstado },
  });
}

export async function actualizarEvidenciaAnclada(
  id: string,
  data: { evidenciaAncladaTx: string; evidenciaTimestamp: Date },
): Promise<Caso> {
  return prisma.caso.update({
    where: { id },
    data: {
      evidenciaAncladaTx: data.evidenciaAncladaTx,
      evidenciaTimestamp: data.evidenciaTimestamp,
    },
  });
}

export async function actualizarDatosLiberacion(
  id: string,
  data: {
    releaseTx: string;
    releaseExplorerUrl: string;
    releasedAt: Date;
  },
): Promise<Caso> {
  return prisma.caso.update({
    where: { id },
    data: {
      releaseTx: data.releaseTx,
      releaseExplorerUrl: data.releaseExplorerUrl,
      releasedAt: data.releasedAt,
      status: "PAGADO",
    },
  });
}

export async function actualizarMotivoRechazo(
  id: string,
  motivo: string,
): Promise<Caso> {
  return prisma.caso.update({
    where: { id },
    data: {
      motivoRechazo: motivo,
      status: "RECHAZADO",
    },
  });
}
