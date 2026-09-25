import type { Request, Response } from "express";
import { z } from "zod";
import * as casesService from "./cases.service";

// ── Schemas ───────────────────────────────────────────────────

const createReportSchema = z.object({
  informanteWallet: z.string().min(1),
  delitoTipo: z
    .string()
    .min(1)
    .transform((v) => v.toUpperCase()),
  descripcion: z.string().min(1),
  evidenciaHash: z.string().optional(),
  montoRecompensaSugerido: z.number().nonnegative().optional(),
});

const verifySchema = z.object({
  rol: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(["POLICIA", "FISCALIA"])),
  verificadorWallet: z.string().min(1),
  resultado: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(["APROBADO", "RECHAZADO"])),
  signedXDR: z.string().optional(),
  motivo: z.string().optional(),
});

// ── Handlers ─────────────────────────────────────────────────

export async function createReportHandler(req: Request, res: Response): Promise<void> {
  try {
    const validated = createReportSchema.parse(req.body);
    const result = await casesService.createReport(validated);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos de reporte inválidos", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function getCasesHandler(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const result = await casesService.getAllCases(status);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al listar casos" });
  }
}

export async function getCaseByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const result = await casesService.getCaseById(id);
    if (!result) {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener caso" });
  }
}

export async function verifyCaseHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const validated = verifySchema.parse(req.body);

    // verificadorId viene del JWT via authMiddleware (req.verificadorId)
    const result = await casesService.verifyCase(id, validated, req.verificadorId);

    if (result.error === "not_found") {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    if (result.error === "already_signed") {
      res.status(409).json({ error: "Este rol ya firmó el caso" });
      return;
    }
    if (result.error === "invalid_status") {
      res.status(400).json({ error: "El caso no admite más firmas en su estado actual" });
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

export async function releaseCaseHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const result = await casesService.releaseCase(id);

    if (result.error === "not_found") {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    if (result.error === "already_paid") {
      res.status(400).json({ error: "La recompensa ya fue liberada previamente" });
      return;
    }
    if (result.error === "not_ready") {
      res.status(400).json({ error: "El caso aún no cuenta con las firmas requeridas (LISTO_PARA_LIBERAR)" });
      return;
    }
    res.status(200).json(result.data);
  } catch (error) {
    res.status(500).json({ error: "Error al liberar pago" });
  }
}

export async function getCaseProofHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const result = await casesService.getCaseProof(id);
    if (!result) {
      res.status(404).json({ error: "Caso no encontrado" });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener prueba" });
  }
}
