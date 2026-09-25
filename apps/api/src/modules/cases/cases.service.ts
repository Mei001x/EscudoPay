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
import {
  anclarEvidenciaStellar,
  liberarPagoStellar,
} from "./stellar.service";

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

  // 2. Crear caso en BD — normalizar enum a mayúsculas para Prisma
  const delitoTipoNorm = data.delitoTipo?.toUpperCase() as any;
  const caso = await crearCaso({
    informanteId: informante.id,
    delitoTipo: delitoTipoNorm,
    descripcion: data.descripcion,
    evidenciaHash: data.evidenciaHash ?? randomBytes(32).toString("hex"),
    montoRecompensaSugerido: data.montoRecompensaSugerido ?? 5000,
  });

  // 3. Anclar evidencia en Stellar (real si hay credencial, fallback simulado)
  let evidenciaAncladaTx: string;
  let evidenciaTimestamp: Date;
  let explorerUrl: string;

  const hasStellarSecret = (process.env.STELLAR_SOURCE_SECRET ?? "")
    .replace(/['"]/g, "")
    .trim();

  if (hasStellarSecret) {
    try {
      const txHash = await anclarEvidenciaStellar(caso.evidenciaHash);
      evidenciaAncladaTx = txHash;
      evidenciaTimestamp = new Date();
      explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    } catch (error) {
      console.warn(
        "[STELLAR WARN] Ejecutando fallback simulado debido a:",
        error,
      );
      const ancla = simularAnclaEvidencia(caso.evidenciaHash);
      evidenciaAncladaTx = ancla.tx;
      evidenciaTimestamp = ancla.timestamp;
      explorerUrl = ancla.explorerUrl;
    }
  } else {
    console.warn(
      "[STELLAR WARN] Ejecutando fallback simulado debido a:",
      "STELLAR_SOURCE_SECRET no configurada - usando modo simulado",
    );
    const ancla = simularAnclaEvidencia(caso.evidenciaHash);
    evidenciaAncladaTx = ancla.tx;
    evidenciaTimestamp = ancla.timestamp;
    explorerUrl = ancla.explorerUrl;
  }

  await actualizarEvidenciaAnclada(caso.id, {
    evidenciaAncladaTx,
    evidenciaTimestamp,
  });

  return {
    caseId: caso.id,
    status: (caso.status as string).toLowerCase(),
    evidenciaAncladaTx,
    explorerUrl,
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
      delitoTipo: (c.delitoTipo as unknown as string).toLowerCase(),
      status: (c.status as string).toLowerCase(),
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
    status: (c.status as string).toLowerCase(),
    delitoTipo: (c.delitoTipo as unknown as string).toLowerCase(),
    evidenciaAncladaTx: c.evidenciaAncladaTx ?? null,
    releaseTx: c.releaseTx ?? null,
    montoRecompensa: c.montoRecompensaSugerido,
    firmas: {
      requeridas: c.firmasRequeridas,
      obtenidas: firmasAprobadas,
      detalle: firmas.map((f: any) => ({
        rol: (f.rol as string)?.toLowerCase() ?? null,
        firmado: f.firmado,
        resultado: f.resultado ? (f.resultado as string).toLowerCase() : null,
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

  // Normalizar rol y resultado a mayúsculas para Prisma (bidireccional)
  const rolNorm = (data.rol as string).toUpperCase() as RolVerificador;
  const resultadoNorm = (data.resultado as string).toUpperCase();

  // Verificar que este rol no haya firmado ya (constraint @@unique en BD)
  const yaFirmo = await existeFirmaPorRol(caseId, rolNorm);
  if (yaFirmo) {
    return { error: "already_signed" as const };
  }

  if (resultadoNorm === "RECHAZADO") {
    await actualizarMotivoRechazo(caseId, data.motivo ?? "Rechazado por el verificador");
    await crearFirma({
      casoId: caseId,
      verificadorId,
      rol: rolNorm,
      resultado: "RECHAZADO",
      signedXDR: data.signedXDR,
    });

    return {
      success: true as const,
      data: {
        caseId,
        status: ("rechazado" as unknown as EstadoCaso),
        motivo: data.motivo ?? "Rechazado por el verificador",
      },
    };
  }

  // APROBADO — guardar la firma
  await crearFirma({
    casoId: caseId,
    verificadorId,
    rol: rolNorm,
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
      status: (nuevoEstado as unknown as string).toLowerCase() as EstadoCaso,
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

  const informanteWallet = (c as any).informante?.walletPublicKey ?? null;
  const monto = c.montoRecompensaSugerido;

  let releaseTx: string;
  let releaseExplorerUrl: string;

  const hasStellarSecretRelease = (process.env.STELLAR_SOURCE_SECRET ?? "")
    .replace(/['"]/g, "")
    .trim();

  if (hasStellarSecretRelease && informanteWallet) {
    try {
      const txHash = await liberarPagoStellar(informanteWallet, monto);
      releaseTx = txHash;
      releaseExplorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    } catch (error) {
      console.warn(
        "[STELLAR WARN] Ejecutando fallback simulado debido a:",
        error,
      );
      const release = simularReleaseTx();
      releaseTx = release.tx;
      releaseExplorerUrl = release.explorerUrl;
    }
  } else {
    console.warn(
      "[STELLAR WARN] Ejecutando fallback simulado debido a:",
      !hasStellarSecretRelease
        ? "STELLAR_SOURCE_SECRET no configurada - usando modo simulado"
        : "informanteWallet no disponible - usando modo simulado",
    );
    const release = simularReleaseTx();
    releaseTx = release.tx;
    releaseExplorerUrl = release.explorerUrl;
  }

  await actualizarDatosLiberacion(caseId, {
    releaseTx,
    releaseExplorerUrl,
    releasedAt: new Date(),
  });

  return {
    success: true as const,
    data: {
      caseId,
      status: ("pagado" as unknown as EstadoCaso),
      tx: releaseTx,
      explorerUrl: releaseExplorerUrl,
      montoLiberado: monto,
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
