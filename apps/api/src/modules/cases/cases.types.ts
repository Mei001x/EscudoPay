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
  delitoTipo: string;
  descripcion: string;
  evidenciaHash?: string;
  montoRecompensaSugerido?: number;
  status: "recibido";
  evidenciaAncladaTx: string;
  explorerUrl: string;
  createdAt: string;
}