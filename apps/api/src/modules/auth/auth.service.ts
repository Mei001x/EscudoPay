import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { config } from "../../config/configuration";
import {
  buscarVerificadorPorCodigo,
  crearRefreshToken,
  buscarRefreshTokenPorHash,
  eliminarRefreshToken,
} from "./auth.repository";

// ── Tipos internos ────────────────────────────────────────────

export interface JwtPayload {
  verificadorId: string;
  rol: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  rol: string;
  nombre: string;
  expiresIn: number;
}

// ── Helpers ───────────────────────────────────────────────────

function generarAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expires as any,
  });
}

/**
 * El refresh token es un valor opaco de 40 bytes aleatorios.
 * Solo se guarda su SHA-256 en BD — nunca el valor en claro.
 */
function generarRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(40).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function refreshTokenExpiresAt(): Date {
  // config.jwt.refreshExpires viene como "7d", "30d", etc.
  const raw = config.jwt.refreshExpires; // e.g. "7d"
  const match = raw.match(/^(\d+)([dhm])$/);
  const amount = match ? parseInt(match[1], 10) : 7;
  const unit = match ? match[2] : "d";
  const ms =
    unit === "d"
      ? amount * 24 * 60 * 60 * 1000
      : unit === "h"
        ? amount * 60 * 60 * 1000
        : amount * 60 * 1000;
  return new Date(Date.now() + ms);
}

// ── Casos de uso ─────────────────────────────────────────────

export async function login(
  codigo: string,
  clave: string,
): Promise<LoginResult> {
  const verificador = await buscarVerificadorPorCodigo(codigo);

  // Mismo mensaje independientemente de si el código existe o no
  // — evita enumerar verificadores válidos
  if (!verificador) {
    throw new Error("CREDENCIALES_INVALIDAS");
  }

  const claveValida = await bcrypt.compare(clave, verificador.claveHash);
  if (!claveValida) {
    throw new Error("CREDENCIALES_INVALIDAS");
  }

  const payload: JwtPayload = {
    verificadorId: verificador.id,
    rol: verificador.rol,
  };

  const accessToken = generarAccessToken(payload);
  const { token: refreshToken, hash: tokenHash } = generarRefreshToken();

  await crearRefreshToken({
    verificadorId: verificador.id,
    tokenHash,
    expiresAt: refreshTokenExpiresAt(),
  });

  // Access token expiry en segundos para la respuesta
  const decoded = jwt.decode(accessToken) as any;
  const expiresIn: number =
    decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;

  return {
    accessToken,
    refreshToken,
    rol: verificador.rol,
    nombre: verificador.nombre,
    expiresIn,
  };
}

export async function refresh(
  refreshTokenValue: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const tokenHash = createHash("sha256")
    .update(refreshTokenValue)
    .digest("hex");

  const stored = await buscarRefreshTokenPorHash(tokenHash);

  if (!stored) {
    throw new Error("REFRESH_TOKEN_INVALIDO");
  }

  if (stored.expiresAt < new Date()) {
    // Limpiamos el token expirado
    await eliminarRefreshToken(tokenHash);
    throw new Error("REFRESH_TOKEN_EXPIRADO");
  }

  const payload: JwtPayload = {
    verificadorId: stored.verificador.id,
    rol: stored.verificador.rol,
  };

  const accessToken = generarAccessToken(payload);
  const decoded = jwt.decode(accessToken) as any;
  const expiresIn: number =
    decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;

  return { accessToken, expiresIn };
}

export async function logout(refreshTokenValue: string): Promise<void> {
  const tokenHash = createHash("sha256")
    .update(refreshTokenValue)
    .digest("hex");
  await eliminarRefreshToken(tokenHash);
}
