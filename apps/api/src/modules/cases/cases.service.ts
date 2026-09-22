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