import type { Request, Response } from "express";
import { z } from "zod";
import { createReport } from "./cases.service";

const createReportSchema = z.object({
  informanteWallet: z.string().min(1, "informanteWallet es requerido"),
  delitoTipo: z.string().min(1, "delitoTipo es requerido"),
  descripcion: z.string().min(1, "descripcion es requerido"),
  evidenciaHash: z.string().optional(),
  montoRecompensaSugerido: z.number().nonnegative().optional(),
});

export function createReportHandler(req: Request, res: Response): void {
  try {
    const parsed = createReportSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Datos de reporte inválidos",
        details: parsed.error.flatten(),
      });
      return;
    }

    const reportCase = createReport(parsed.data);
    res.status(201).json(reportCase);
  } catch {
    res.status(500).json({ error: "Error interno al registrar el reporte" });
  }
}