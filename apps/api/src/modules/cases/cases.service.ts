import { randomBytes, randomUUID } from "node:crypto";
import type { CreateReportRequest, ReportCase } from "./cases.types";

const reports = new Map<string, ReportCase>();

// Seed fijo para que test.http con ID 562f3fd0-8c1e-42af-886d-b6c87014107d funcione sin 404 tras reinicio
// Se resetea a recibida/0 firmas para que puedas re-ejecutar las firmas de test.http sin 400 already_signed
const __seedId = "562f3fd0-8c1e-42af-886d-b6c87014107d";
{
  const __evidencia = randomBytes(32).toString("hex");
  reports.set(__seedId, {
    caseId: __seedId,
    informanteWallet: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
    delitoTipo: "extorsion",
    descripcion: "Sospechoso identificado en zona comercial",
    status: "recibido",
    evidenciaAncladaTx: __evidencia,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${__evidencia}`,
    createdAt: new Date().toISOString(),
    montoRecompensaSugerido: 3000,
  } as ReportCase);
}

export function createReport(data: CreateReportRequest): ReportCase {
  const evidenciaAncladaTx = randomBytes(32).toString("hex");

  const reportCase: ReportCase = {
    caseId: randomUUID(),
    informanteWallet: data.informanteWallet,
    delitoTipo: data.delitoTipo,
    descripcion: data.descripcion,
    status: "recibido",
    evidenciaAncladaTx,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${evidenciaAncladaTx}`,
    createdAt: new Date().toISOString(),
  };

  if (data.evidenciaHash) {
    reportCase.evidenciaHash = data.evidenciaHash;
  }

  if (data.montoRecompensaSugerido !== undefined) {
    reportCase.montoRecompensaSugerido = data.montoRecompensaSugerido;
  }

  reports.set(reportCase.caseId, reportCase);
  return reportCase;
}

export function getAllCases(status?: string) {
  const all = Array.from(reports.values());
  const filtered = status ? all.filter((c) => c.status === status) : all;
  return {
    total: filtered.length,
    casos: filtered.map((c) => ({
      caseId: c.caseId,
      delitoTipo: c.delitoTipo,
      status: c.status,
      montoRecompensa: c.montoRecompensaSugerido ?? 0,
      createdAt: c.createdAt,
    })),
  };
}

export function getCaseById(caseId: string) {
  const c = reports.get(caseId);
  if (!c) return null;
  const firmasPersistidas = (c as unknown as Record<string, unknown>).firmas as
    | { requeridas: number; obtenidas: number; detalle: Array<{ rol: string; firmado: boolean; fecha: string | null; signerWallet: string | null }> }
    | undefined;
  const firmas = firmasPersistidas ?? {
    requeridas: 2,
    obtenidas: 0,
    detalle: [
      { rol: "policia", firmado: false, fecha: null, signerWallet: null },
      { rol: "fiscal", firmado: false, fecha: null, signerWallet: null },
    ],
  };
  return {
    ...c,
    montoRecompensa: (c as ReportCase & { montoRecompensaSugerido?: number }).montoRecompensaSugerido ?? 0,
    firmas,
  };
}

export function addSignature(
  caseId: string,
  data: { signerWallet: string; rol: "policia" | "fiscal"; decision: "aprobar" | "rechazar" },
) {
  const caso = reports.get(caseId) as
    | (ReportCase & {
        firmas?: {
          requeridas: number;
          obtenidas: number;
          detalle: Array<{ rol: string; firmado: boolean; fecha: string | null; signerWallet: string | null }>;
        };
      })
    | undefined;

  if (!caso) {
    return { error: "not_found" as const };
  }

  if (!caso.firmas) {
    (caso as unknown as Record<string, unknown>).firmas = {
      requeridas: 2,
      obtenidas: 0,
      detalle: [
        { rol: "policia", firmado: false, fecha: null, signerWallet: null },
        { rol: "fiscal", firmado: false, fecha: null, signerWallet: null },
      ],
    };
  }

  const firmas = (caso as unknown as Record<string, unknown>).firmas as {
    requeridas: number;
    obtenidas: number;
    detalle: Array<{ rol: string; firmado: boolean; fecha: string | null; signerWallet: string | null }>;
  };

  const slot = firmas.detalle.find((d) => d.rol === data.rol);

  if (!slot) {
    return { error: "not_found" as const };
  }

  if (slot.firmado === true) {
    return { error: "already_signed" as const };
  }

  if (data.decision === "rechazar") {
    slot.firmado = true;
    slot.fecha = new Date().toISOString();
    slot.signerWallet = data.signerWallet;
    (caso as unknown as Record<string, unknown>).status = "rechazado";
    return { caso };
  }

  if (data.decision === "aprobar") {
    slot.firmado = true;
    slot.fecha = new Date().toISOString();
    slot.signerWallet = data.signerWallet;
    firmas.obtenidas += 1;
    if (firmas.obtenidas >= 2) {
      (caso as unknown as Record<string, unknown>).status = "aprobado";
    } else {
      (caso as unknown as Record<string, unknown>).status = "en_verificacion";
    }
    return { caso };
  }

  return { caso };
}

export function processPayout(caseId: string) {
  const caso = reports.get(caseId) as
    | (ReportCase & {
        status: string;
        montoRecompensa?: number;
        montoRecompensaSugerido?: number;
        payoutTxHash?: string;
        payoutExplorerUrl?: string;
        paidAt?: string;
      })
    | undefined;

  if (!caso) {
    return { error: "not_found" as const };
  }

  if ((caso as unknown as Record<string, unknown>).status === "pagado") {
    return { error: "already_paid" as const };
  }

  if ((caso as unknown as Record<string, unknown>).status !== "aprobado") {
    return { error: "not_approved" as const };
  }

  const payoutTxHash = randomBytes(32).toString("hex");
  const payoutExplorerUrl = `https://stellar.expert/explorer/testnet/tx/${payoutTxHash}`;
  const paidAt = new Date().toISOString();

  (caso as unknown as Record<string, unknown>).status = "pagado";
  (caso as unknown as Record<string, unknown>).payoutTxHash = payoutTxHash;
  (caso as unknown as Record<string, unknown>).payoutExplorerUrl = payoutExplorerUrl;
  (caso as unknown as Record<string, unknown>).paidAt = paidAt;

  const amount =
    (caso as unknown as Record<string, unknown>).montoRecompensa ??
    (caso as unknown as Record<string, unknown>).montoRecompensaSugerido ??
    0;

  return {
    caso,
    payout: {
      caseId: caso.caseId,
      recipientWallet: caso.informanteWallet,
      amount: amount as number,
      status: "pagado" as const,
      payoutTxHash,
      payoutExplorerUrl,
      paidAt,
    },
  };
}