import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { config } from "../../config/configuration";
import {
  buscarVerificadorPorCodigo,
  crearRefreshToken,
  buscarRefreshTokenPorHash,
  eliminarRefreshToken,
  rotarRefreshToken,
} from "./auth.repository";

// ── Tipos ─────────────────────────────────────────────────────

export interface JwtPayload {
  verificadorId: string;
  rol: string;
}

/**
 * login ya NO incluye refreshToken — el valor plano solo
 * llega al controller para que lo setee en la cookie httpOnly.
 */
export interface LoginResult {
  accessToken: string;
  refreshTokenPlano: string; // solo para que el controller lo ponga en cookie
  rol: string;
  nombre: string;
  expiresIn: number;
}

export interface RefreshResult {
  accessToken: string;
  refreshTokenPlano: string; // nuevo token rotado, para renovar la cookie
  expiresIn: number;
}

// ── Helpers ───────────────────────────────────────────────────

function generarAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expires as any,
  });
}

/**
 * Genera un token opaco de 40 bytes.
 * Devuelve el valor en claro (para la cookie) y su SHA-256 (para la BD).
 */
function generarRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(40).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function hashToken(tokenPlano: string): string {
  return createHash("sha256").update(tokenPlano).digest("hex");
}

function refreshTokenExpiresAt(): Date {
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

function calcularExpiresIn(accessToken: string): number {
  const decoded = jwt.decode(accessToken) as any;
  return decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
}

// ── Casos de uso ─────────────────────────────────────────────

export async function login(
  codigo: string,
  clave: string,
): Promise<LoginResult> {
  const verificador = await buscarVerificadorPorCodigo(codigo);

  // Mismo error para código inexistente o clave incorrecta
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
  const { token: refreshTokenPlano, hash: tokenHash } = generarRefreshToken();

  await crearRefreshToken({
    verificadorId: verificador.id,
    tokenHash,
    expiresAt: refreshTokenExpiresAt(),
  });

  return {
    accessToken,
    refreshTokenPlano, // el controller lo setea en cookie httpOnly
    rol: verificador.rol,
    nombre: verificador.nombre,
    expiresIn: calcularExpiresIn(accessToken),
  };
}

export async function refresh(
  refreshTokenPlano: string,
): Promise<RefreshResult> {
  const tokenHashViejo = hashToken(refreshTokenPlano);
  const stored = await buscarRefreshTokenPorHash(tokenHashViejo);

  if (!stored) {
    throw new Error("REFRESH_TOKEN_INVALIDO");
  }

  if (stored.expiresAt < new Date()) {
    await eliminarRefreshToken(tokenHashViejo);
    throw new Error("REFRESH_TOKEN_EXPIRADO");
  }

  // Rotar: emitir nuevo token y reemplazar el viejo en BD (atómico)
  const { token: nuevoTokenPlano, hash: tokenHashNuevo } = generarRefreshToken();

  await rotarRefreshToken({
    tokenHashViejo,
    verificadorId: stored.verificador.id,
    tokenHashNuevo,
    expiresAt: refreshTokenExpiresAt(),
  });

  const payload: JwtPayload = {
    verificadorId: stored.verificador.id,
    rol: stored.verificador.rol,
  };

  const accessToken = generarAccessToken(payload);

  return {
    accessToken,
    refreshTokenPlano: nuevoTokenPlano, // el controller renueva la cookie
    expiresIn: calcularExpiresIn(accessToken),
  };
}

export async function logout(refreshTokenPlano: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenPlano);
  await eliminarRefreshToken(tokenHash);
}
