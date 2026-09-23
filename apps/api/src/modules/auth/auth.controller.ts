import type { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

// ── Schemas de validación ─────────────────────────────────────

const loginSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  clave: z.string().min(1, "La clave es obligatoria"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "El refresh token es obligatorio"),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "El refresh token es obligatorio"),
});

// ── Handlers ─────────────────────────────────────────────────

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { codigo, clave } = loginSchema.parse(req.body);
    const result = await authService.login(codigo, clave);

    res.status(200).json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      rol: result.rol,
      nombre: result.nombre,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos de login inválidos", details: error.issues });
      return;
    }
    if (error instanceof Error && error.message === "CREDENCIALES_INVALIDAS") {
      res.status(401).json({ error: "Código o clave incorrectos" });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await authService.refresh(refreshToken);

    res.status(200).json({
      token: result.accessToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.issues });
      return;
    }
    if (error instanceof Error) {
      if (error.message === "REFRESH_TOKEN_INVALIDO") {
        res.status(401).json({ error: "Refresh token inválido" });
        return;
      }
      if (error.message === "REFRESH_TOKEN_EXPIRADO") {
        res.status(401).json({ error: "Refresh token expirado, inicia sesión nuevamente" });
        return;
      }
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = logoutSchema.parse(req.body);
    await authService.logout(refreshToken);

    res.status(200).json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
