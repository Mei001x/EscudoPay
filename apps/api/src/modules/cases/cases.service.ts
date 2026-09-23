import { randomBytes } from "node:crypto";
import type { CreateReportRequest, VerifyRequest } from "./cases.types";

// ------------------------------------------------------------
// Almacenamiento temporal en memoria — se reemplazará por
// casos.repository.ts en la Tarea 2 (Prisma)
// ------------------------------------------------------------
const reports = new Map<string, any>();

export function createReport(data: CreateReportRequest) {
  const caseId = `case_${randomBytes(3).toString("hex")}`;
  const evidenciaAncladaTx = randomBytes(32).toString("hex");
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${evidenciaAncladaTx}`;
  const createdAt = new Date().toISOString();
  const claimableBalanceId = randomBytes(32).toString("hex");

  const newCase = {
    caseId,
    status: "RECIBIDO",
    informanteWallet: data.informanteWallet,
    delitoTipo: data.delitoTipo,
    descripcion: data.descripcion,
    evidenciaHash: data.evidenciaHash ?? randomBytes(32).toString("hex"),
    montoRecompensa: data.montoRecompensaSugerido ?? 5000,
    evidenciaAncladaTx,
    explorerUrl,
    createdAt,
    claimableBalanceId,
    firmas: {
      requeridas: 2,
      obtenidas: 0,
      detalle: [
        { rol: "POLICIA", firmado: false, fecha: null, verificadorWallet: null },
        { rol: "FISCALIA", firmado: false, fecha: null, verificadorWallet: null },
      ],
    },
    releaseTx: null,
    releaseExplorerUrl: null,
    paidAt: null,
    motivoRechazo: null,
  };

  reports.set(caseId, newCase);

  return {
    caseId,
    status: newCase.status,
    evidenciaAncladaTx: newCase.evidenciaAncladaTx,
    explorerUrl: newCase.explorerUrl,
    createdAt: newCase.createdAt,
  };
}

export function getAllCases(status?: string) {
  let list = Array.from(reports.values());
  if (status) {
    // acepta tanto mayúsculas como minúsculas desde el query param
    list = list.filter((c) => c.status === status.toUpperCase());
  }
  return {
    total: list.length,
    casos: list.map((c) => ({
      caseId: c.caseId,
      delitoTipo: c.delitoTipo,
      status: c.status,
      montoRecompensa: c.montoRecompensa,
      createdAt: c.createdAt,
    })),
  };
}

export function getCaseById(caseId: string) {
  const c = reports.get(caseId);
  if (!c) return null;
  return {
    caseId: c.caseId,
    status: c.status,
    firmas: c.firmas,
    claimableBalanceId: c.claimableBalanceId,
    montoRecompensa: c.montoRecompensa,
  };
}

export function verifyCase(caseId: string, data: VerifyRequest) {
  const c = reports.get(caseId);
  if (!c) return { error: "not_found" };

  if (data.resultado === "RECHAZADO") {
    c.status = "RECHAZADO";
    c.motivoRechazo = data.motivo ?? "Rechazado por el verificador";
    return {
      success: true,
      data: {
        caseId: c.caseId,
        status: "RECHAZADO",
        motivo: c.motivoRechazo,
      },
    };
  }

  // APROBADO — marcar la firma del rol correspondiente
  const firmaSlot = c.firmas.detalle.find((f: any) => f.rol === data.rol);
  if (firmaSlot && !firmaSlot.firmado) {
    firmaSlot.firmado = true;
    firmaSlot.fecha = new Date().toISOString();
    firmaSlot.verificadorWallet = data.verificadorWallet;
    c.firmas.obtenidas += 1;
  }

  const humanasFirmadas: number = c.firmas.detalle.filter(
    (f: any) => (f.rol === "POLICIA" || f.rol === "FISCALIA") && f.firmado,
  ).length;

  c.status = humanasFirmadas >= 2 ? "LISTO_PARA_LIBERAR" : "EN_VERIFICACION";

  return {
    success: true,
    data: {
      caseId: c.caseId,
      status: c.status,
      firmasObtenidas: humanasFirmadas,
      firmasRequeridas: c.firmas.requeridas,
    },
  };
}

export function releaseCase(caseId: string) {
  const c = reports.get(caseId);
  if (!c) return { error: "not_found" };
  if (c.status === "PAGADO") return { error: "already_paid" };
  if (c.status !== "LISTO_PARA_LIBERAR") return { error: "not_ready" };

  const tx = randomBytes(32).toString("hex");
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${tx}`;
  c.status = "PAGADO";
  c.releaseTx = tx;
  c.releaseExplorerUrl = explorerUrl;
  c.paidAt = new Date().toISOString();

  return {
    success: true,
    data: {
      caseId: c.caseId,
      status: "PAGADO",
      tx,
      explorerUrl,
      montoLiberado: c.montoRecompensa,
      receptor: c.informanteWallet,
    },
  };
}

export function getCaseProof(caseId: string) {
  const c = reports.get(caseId);
  if (!c) return null;

  return {
    evidenciaHash: c.evidenciaHash,
    evidenciaTimestamp: c.createdAt,
    explorerLinks: {
      evidencia: c.explorerUrl,
      pago: c.releaseExplorerUrl ?? null,
    },
  };
}
