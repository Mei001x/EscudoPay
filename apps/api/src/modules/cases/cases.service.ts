import { randomBytes, randomUUID } from "node:crypto";
import type { CreateReportRequest, ReportCase } from "./cases.types";

const reports = new Map<string, ReportCase>();

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
  return {
    ...c,
    montoRecompensa: (c as ReportCase & { montoRecompensaSugerido?: number }).montoRecompensaSugerido ?? 0,
    firmas: {
      requeridas: 2,
      obtenidas: 0,
      detalle: [
        { rol: "policia", firmado: false, fecha: null },
        { rol: "fiscal", firmado: false, fecha: null },
      ],
    },
  };
}