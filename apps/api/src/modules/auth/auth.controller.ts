import type { Request, Response } from "express";
import { z } from "zod";

const loginSchema = z.object({
  codigo: z.string().min(1),
  clave: z.string().min(1),
});

export function loginHandler(req: Request, res: Response): void {
  try {
    const { codigo } = loginSchema.parse(req.body);
    const esFiscal = codigo.toLowerCase().includes("fisc") || codigo.toLowerCase().includes("mp");
    const rol = esFiscal ? "fiscalia" : "policia";

    res.status(200).json({
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockTokenClaveSegura2026",
      rol,
      nombre: esFiscal ? "Fiscal Provincial de Turno" : `Instructor asignado #${codigo}`,
      expiresIn: 3600,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos de login inválidos", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
