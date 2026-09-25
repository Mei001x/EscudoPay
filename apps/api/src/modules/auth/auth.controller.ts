import type { Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

// ── Configuración de la cookie ────────────────────────────────

const COOKIE_NAME = "refreshToken";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

function setCookieRefreshToken(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                                          // inaccesible desde document.cookie
    secure: process.env.NODE_ENV === "production",          // solo HTTPS en prod
    sameSite: "strict",                                     // no viaja en requests cross-site
    maxAge: COOKIE_MAX_AGE,
    path: "/api/auth",                                      // solo rutas de auth necesitan la cookie
  });
}

function clearCookieRefreshToken(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/api/auth" });
}

// ── Schemas de validación ─────────────────────────────────────

const loginSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  clave: z.string().min(1, "La clave es obligatoria"),
});

// ── Handlers ─────────────────────────────────────────────────

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { codigo, clave } = loginSchema.parse(req.body);
    const result = await authService.login(codigo, clave);

    // Refresh token va SOLO en cookie httpOnly — nunca en el body
    setCookieRefreshToken(res, result.refreshTokenPlano);

    res.status(200).json({
      token: result.accessToken,
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
    // El refresh token viene de la cookie httpOnly, no del body
    const tokenDeCookie = req.cookies?.[COOKIE_NAME];

    if (!tokenDeCookie) {
      res.status(401).json({ error: "Refresh token no encontrado" });
      return;
    }

    const result = await authService.refresh(tokenDeCookie);

    // Rotar: setear el nuevo token en la cookie
    setCookieRefreshToken(res, result.refreshTokenPlano);

    res.status(200).json({
      token: result.accessToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "REFRESH_TOKEN_INVALIDO") {
        clearCookieRefreshToken(res);
        res.status(401).json({ error: "Refresh token inválido" });
        return;
      }
      if (error.message === "REFRESH_TOKEN_EXPIRADO") {
        clearCookieRefreshToken(res);
        res.status(401).json({ error: "Refresh token expirado, inicia sesión nuevamente" });
        return;
      }
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const tokenDeCookie = req.cookies?.[COOKIE_NAME];

    if (tokenDeCookie) {
      await authService.logout(tokenDeCookie);
    }
    // Si no hay cookie, igual se considera logout exitoso (idempotente)

    clearCookieRefreshToken(res);
    res.status(200).json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
