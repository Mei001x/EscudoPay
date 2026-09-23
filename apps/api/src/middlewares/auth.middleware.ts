import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/configuration";
import type { JwtPayload } from "../modules/auth/auth.service";

// Extiende el tipo de Request para exponer el payload del JWT
declare global {
  namespace Express {
    interface Request {
      verificadorId?: string;
      rol?: string;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticación requerido" });
    return;
  }

  const token = authHeader.slice(7); // quita "Bearer "

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.verificadorId = payload.verificadorId;
    req.rol = payload.rol;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expirado", code: "TOKEN_EXPIRED" });
      return;
    }
    res.status(401).json({ error: "Token inválido", code: "TOKEN_INVALID" });
  }
}

/**
 * Guard de roles — debe usarse DESPUÉS de authMiddleware.
 * Uso: requireRol("POLICIA", "FISCALIA")
 */
export function requireRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.rol || !roles.includes(req.rol)) {
      res.status(403).json({ error: "Acceso denegado: rol insuficiente" });
      return;
    }
    next();
  };
}
