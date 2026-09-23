import type { EstadoCaso, RolVerificador, TipoDelito } from "@prisma/client";

export interface CreateReportRequest {
  informanteWallet: string;
  delitoTipo: string;
  descripcion: string;
  evidenciaHash?: string;
  montoRecompensaSugerido?: number;
}

export interface ReportCase {
  caseId: string;
  informanteWallet: string;
  delitoTipo: TipoDelito;
  descripcion: string;
  evidenciaHash?: string;
  montoRecompensaSugerido?: number;
  status: EstadoCaso;
  evidenciaAncladaTx: string;
  explorerUrl: string;
  createdAt: string;
}

export interface VerifyRequest {
  rol: RolVerificador;
  verificadorWallet: string;
  resultado: "APROBADO" | "RECHAZADO";
  signedXDR?: string;
  motivo?: string;
}
