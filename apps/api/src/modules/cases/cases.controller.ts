import type { Request, Response } from "express";
import { z } from "zod";
import * as casesService from "./cases.service";

const createReportSchema = z.object({
  informanteWallet: z.string().min(1),
  delitoTipo: z.string().min(1),
  descripcion: z.string().min(1),
  evidenciaHash: z.string().optional(),
  montoRecompensaSugerido: z.number().nonnegative().optional(),
});

export function createReportHandler(req: Request, res: Response): void {
  try {
    const validated = createReportSchema.parse(req.body);
    const result = casesService.createReport(validated);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos de reporte inválidos", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

export function getCasesHandler(req: Request, res: Response): void {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const result = casesService.getAllCases(status);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al listar casos" });
  }
}

export function getCaseByIdHandler(req: Request, res: Response): void {
  try {
    const id = String(req.params.id);
    const result = casesService.getCaseById(id);
    if (!result) {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener caso" });
  }
}

const verifySchema = z.object({
  rol: z.enum(["policia", "fiscalia"]),
  verificadorWallet: z.string().min(1),
  resultado: z.enum(["aprobado", "rechazado"]),
  signedXDR: z.string().optional(),
  motivo: z.string().optional(),
});

export function verifyCaseHandler(req: Request, res: Response): void {
  try {
    const id = String(req.params.id);
    const validated = verifySchema.parse(req.body);
    const result = casesService.verifyCase(id, validated);

    if (result.error === "not_found") {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result.data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos de verificación inválidos", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Error al procesar verificación" });
  }
}

export function releaseCaseHandler(req: Request, res: Response): void {
  try {
    const id = String(req.params.id);
    const result = casesService.releaseCase(id);

    if (result.error === "not_found") {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    if (result.error === "already_paid") {
      res.status(400).json({ error: "La recompensa ya fue liberada previamente" });
      return;
    }
    if (result.error === "not_ready") {
      res.status(400).json({ error: "El caso aún no cuenta con las firmas requeridas (listo_para_liberar)" });
      return;
    }

    res.status(200).json(result.data);
  } catch (error) {
    res.status(500).json({ error: "Error al liberar pago" });
  }
}

export function getCaseProofHandler(req: Request, res: Response): void {
  try {
    const id = String(req.params.id);
    const result = casesService.getCaseProof(id);
    if (!result) {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener prueba" });
  }
}
