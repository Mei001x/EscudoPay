import { randomBytes } from "node:crypto";
import type { EstadoCaso, RolVerificador } from "@prisma/client";
import type { CreateReportRequest, VerifyRequest } from "./cases.types";
import {
  crearCaso,
  obtenerCasoPorId,
  listarCasos,
  actualizarEstadoCaso,
  actualizarEvidenciaAnclada,
  actualizarDatosLiberacion,
  actualizarMotivoRechazo,
} from "./cases.repository";
import { buscarOCrearInformante } from "../informantes/informantes.repository";
import {
  crearFirma,
  contarFirmasValidas,
  existeFirmaPorRol,
} from "../firmas/firmas.repository";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Simula el ancla de evidencia en Stellar (manageData).
 * TODO Tarea 6 del spec: reemplazar por stellar.service.anclarEvidencia()
 */
function simularAnclaEvidencia(evidenciaHash: string): {
  tx: string;
  explorerUrl: string;
  timestamp: Date;
} {
  const tx = randomBytes(32).toString("hex");
  return {
    tx,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx}`,
    timestamp: new Date(),
  };
}

/**
 * Simula el submit a Horizon (claimClaimableBalance / payment).
 * TODO Tarea 7 del spec: reemplazar por stellar.service.enviarTransaccion()
 */
function simularReleaseTx(): { tx: string; explorerUrl: string } {
  const tx = randomBytes(32).toString("hex");
  return {
    tx,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${tx}`,
  };
}

// ── Casos de uso ─────────────────────────────────────────────

export async function createReport(data: CreateReportRequest) {
  // 1. Upsert informante — se identifica solo por wallet
  const informante = await buscarOCrearInformante(data.informanteWallet);

  // 2. Crear caso en BD
  const caso = await crearCaso({
    informanteId: informante.id,
    delitoTipo: data.delitoTipo,
    descripcion: data.descripcion,
    evidenciaHash: data.evidenciaHash ?? randomBytes(32).toString("hex"),
    montoRecompensaSugerido: data.montoRecompensaSugerido ?? 5000,
  });

  // 3. Anclar evidencia en Stellar (simulado — Tarea 6 reemplaza esto)
  const ancla = simularAnclaEvidencia(caso.evidenciaHash);
  await actualizarEvidenciaAnclada(caso.id, {
    evidenciaAncladaTx: ancla.tx,
    evidenciaTimestamp: ancla.timestamp,
  });

  return {
    caseId: caso.id,
    status: caso.status,
    evidenciaAncladaTx: ancla.tx,
    explorerUrl: ancla.explorerUrl,
    createdAt: caso.createdAt.toISOString(),
  };
}

export async function getAllCases(status?: string) {
  const filtroStatus = status
    ? (status.toUpperCase() as EstadoCaso)
    : undefined;

  const casos = await listarCasos(filtroStatus);

  return {
    total: casos.length,
    casos: casos.map((c) => ({
      caseId: c.id,
      delitoTipo: c.delitoTipo,
      status: c.status,
      montoRecompensa: c.montoRecompensaSugerido,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function getCaseById(caseId: string) {
  const c = await obtenerCasoPorId(caseId);
  if (!c) return null;

  const firmas = (c as any).firmas ?? [];
  const firmasAprobadas = firmas.filter(
    (f: any) => f.firmado && f.resultado === "APROBADO",
  ).length;

  return {
    caseId: c.id,
    status: c.status,
    delitoTipo: c.delitoTipo,
    evidenciaAncladaTx: c.evidenciaAncladaTx ?? null,
    releaseTx: c.releaseTx ?? null,
    montoRecompensa: c.montoRecompensaSugerido,
    firmas: {
      requeridas: c.firmasRequeridas,
      obtenidas: firmasAprobadas,
      detalle: firmas.map((f: any) => ({
        rol: f.rol,
        firmado: f.firmado,
        resultado: f.resultado ?? null,
        fecha: f.fecha?.toISOString() ?? null,
      })),
    },
    stellarTransaction: (c as any).stellarTransaction
      ? {
        firmasAcumuladas: (c as any).stellarTransaction.firmasAcumuladas,
        firmasRequeridas: (c as any).stellarTransaction.firmasRequeridas,
        status: (c as any).stellarTransaction.status,
      }
      : null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function verifyCase(
  caseId: string,
  data: VerifyRequest,
  verificadorId?: string,
) {
  const c = await obtenerCasoPorId(caseId);
  if (!c) return { error: "not_found" as const };

  // Verificar que el caso está en un estado que admite firma
  if (c.status === "PAGADO" || c.status === "RECHAZADO") {
    return { error: "invalid_status" as const };
  }

  // Verificar que este rol no haya firmado ya (constraint @@unique en BD)
  const yaFirmo = await existeFirmaPorRol(caseId, data.rol as RolVerificador);
  if (yaFirmo) {
    return { error: "already_signed" as const };
  }

  if (data.resultado === "RECHAZADO") {
    await actualizarMotivoRechazo(caseId, data.motivo ?? "Rechazado por el verificador");
    await crearFirma({
      casoId: caseId,
      verificadorId,
      rol: data.rol as RolVerificador,
      resultado: "RECHAZADO",
      signedXDR: data.signedXDR,
    });

    return {
      success: true as const,
      data: {
        caseId,
        status: "RECHAZADO" as EstadoCaso,
        motivo: data.motivo ?? "Rechazado por el verificador",
      },
    };
  }

  // APROBADO — guardar la firma
  await crearFirma({
    casoId: caseId,
    verificadorId,
    rol: data.rol as RolVerificador,
    resultado: "APROBADO",
    signedXDR: data.signedXDR,
  });

  // Contar firmas aprobadas acumuladas
  const firmasAprobadas = await contarFirmasValidas(caseId);
  const nuevoEstado: EstadoCaso =
    firmasAprobadas >= c.firmasRequeridas
      ? "LISTO_PARA_LIBERAR"
      : "EN_VERIFICACION";

  await actualizarEstadoCaso(caseId, nuevoEstado);

  return {
    success: true as const,
    data: {
      caseId,
      status: nuevoEstado,
      firmasObtenidas: firmasAprobadas,
      firmasRequeridas: c.firmasRequeridas,
    },
  };
}

export async function releaseCase(caseId: string) {
  const c = await obtenerCasoPorId(caseId);
  if (!c) return { error: "not_found" as const };
  if (c.status === "PAGADO") return { error: "already_paid" as const };
  if (c.status !== "LISTO_PARA_LIBERAR") return { error: "not_ready" as const };

  // Simular submit a Horizon (Tarea 7 reemplaza esto con Stellar real)
  const release = simularReleaseTx();

  await actualizarDatosLiberacion(caseId, {
    releaseTx: release.tx,
    releaseExplorerUrl: release.explorerUrl,
    releasedAt: new Date(),
  });

  const informanteWallet = (c as any).informante?.walletPublicKey ?? null;

  return {
    success: true as const,
    data: {
      caseId,
      status: "PAGADO" as EstadoCaso,
      tx: release.tx,
      explorerUrl: release.explorerUrl,
      montoLiberado: c.montoRecompensaSugerido,
      receptor: informanteWallet,
    },
  };
}

export async function getCaseProof(caseId: string) {
  const c = await obtenerCasoPorId(caseId);
  if (!c) return null;

  return {
    evidenciaHash: c.evidenciaHash,
    evidenciaTimestamp: c.evidenciaTimestamp?.toISOString() ?? null,
    explorerLinks: {
      evidencia: c.evidenciaAncladaTx
        ? `https://stellar.expert/explorer/testnet/tx/${c.evidenciaAncladaTx}`
        : null,
      pago: c.releaseTx
        ? `https://stellar.expert/explorer/testnet/tx/${c.releaseTx}`
        : null,
    },
  };
}
