import type { Request, Response } from "express";
import { z } from "zod";
import { addSignature, createReport, getAllCases, getCaseById } from "./cases.service";

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

export function getCasesHandler(req: Request, res: Response): void {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const result = getAllCases(status);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Error interno al obtener los casos" });
  }
}

export function getCaseByIdHandler(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    if (typeof id !== "string") {
      res.status(400).json({ error: "ID inválido" });
      return;
    }
    const result = getCaseById(id);
    if (result === null) {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Error interno al obtener el caso" });
  }
}

export function addSignatureHandler(req: Request, res: Response): void {
  try {
    const signatureSchema = z.object({
      signerWallet: z.string().min(1),
      rol: z.enum(["policia", "fiscal"]),
      decision: z.enum(["aprobar", "rechazar"]).default("aprobar"),
    });

    const parsed = signatureSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Datos de firma inválidos",
        details: parsed.error.flatten(),
      });
      return;
    }

    const id = String(req.params.id);
    const result = addSignature(id, parsed.data);

    if ((result as { error?: string }).error === "not_found") {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }

    if ((result as { error?: string }).error === "already_signed") {
      res.status(400).json({ error: "Este rol ya firmó el caso" });
      return;
    }

    res.status(200).json((result as { caso: unknown }).caso);
  } catch {
    res.status(500).json({ error: "Error interno al firmar el caso" });
  }
}