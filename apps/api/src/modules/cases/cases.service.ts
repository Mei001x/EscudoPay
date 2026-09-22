import { randomBytes, randomUUID } from "node:crypto";
import type { CreateReportRequest, ReportCase } from "./cases.types";

const reports = new Map<string, any>();

export function createReport(data: CreateReportRequest) {
  const caseId = `case_${randomBytes(3).toString("hex")}`;
  const evidenciaAncladaTx = randomBytes(32).toString("hex");
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${evidenciaAncladaTx}`;
  const createdAt = new Date().toISOString();
  const claimableBalanceId = randomBytes(32).toString("hex");

  const newCase = {
    caseId,
    status: "recibido",
    informanteWallet: data.informanteWallet,
    delitoTipo: data.delitoTipo,
    descripcion: data.descripcion,
    evidenciaHash: data.evidenciaHash || randomBytes(32).toString("hex"),
    montoRecompensa: data.montoRecompensaSugerido || 5000,
    evidenciaAncladaTx,
    explorerUrl,
    createdAt,
    claimableBalanceId,
    firmas: {
      requeridas: 2,
      obtenidas: 1,
      detalle: [
        { rol: "policia", firmado: false, fecha: null, verificadorWallet: null },
        { rol: "fiscalia", firmado: false, fecha: null, verificadorWallet: null },
        { rol: "sistema", firmado: true, fecha: createdAt, verificadorWallet: "SISTEMA_ESCUDOPAY" }
      ]
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
    list = list.filter((c) => c.status === status);
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

export function verifyCase(caseId: string, data: {
  rol: "policia" | "fiscalia";
  verificadorWallet: string;
  resultado: "aprobado" | "rechazado";
  signedXDR?: string;
  motivo?: string;
}) {
  const c = reports.get(caseId);
  if (!c) return { error: "not_found" };

  if (data.resultado === "rechazado") {
    c.status = "rechazado";
    c.motivoRechazo = data.motivo || "Rechazado por el verificador";
    return {
      success: true,
      data: {
        caseId: c.caseId,
        status: "rechazado",
        motivo: c.motivoRechazo,
      }
    };
  }

  // Aprobado
  const firmaSlot = c.firmas.detalle.find((f: any) => f.rol === data.rol);
  if (firmaSlot && !firmaSlot.firmado) {
    firmaSlot.firmado = true;
    firmaSlot.fecha = new Date().toISOString();
    firmaSlot.verificadorWallet = data.verificadorWallet;
    c.firmas.obtenidas += 1;
  }

  // Si cuenta con las 2 firmas de autoridades (policia y fiscalia) o >= 2
  const humanasFirmadas = c.firmas.detalle.filter((f: any) => (f.rol === "policia" || f.rol === "fiscalia") && f.firmado).length;
  if (humanasFirmadas >= 2 || c.firmas.obtenidas >= 3) {
    c.status = "listo_para_liberar";
  } else {
    c.status = "en_verificacion";
  }

  return {
    success: true,
    data: {
      caseId: c.caseId,
      status: c.status,
      firmasObtenidas: humanasFirmadas,
      firmasRequeridas: c.firmas.requeridas,
    }
  };
}

export function releaseCase(caseId: string) {
  const c = reports.get(caseId);
  if (!c) return { error: "not_found" };
  if (c.status === "pagado") return { error: "already_paid" };
  if (c.status !== "listo_para_liberar") return { error: "not_ready" };

  const tx = randomBytes(32).toString("hex");
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${tx}`;
  c.status = "pagado";
  c.releaseTx = tx;
  c.releaseExplorerUrl = explorerUrl;
  c.paidAt = new Date().toISOString();

  return {
    success: true,
    data: {
      caseId: c.caseId,
      status: "pagado",
      tx,
      explorerUrl,
      montoLiberado: c.montoRecompensa,
      receptor: c.informanteWallet,
    }
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
      pago: c.releaseExplorerUrl || null,
    }
  };
}
