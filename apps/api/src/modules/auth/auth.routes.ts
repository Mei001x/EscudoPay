import { Router } from "express";
import { loginHandler, refreshHandler, logoutHandler } from "./auth.controller";

const authRoutes = Router();

// POST /api/auth/login   — autenticar verificador (policía/fiscalía)
authRoutes.post("/login", loginHandler);

// POST /api/auth/refresh — emitir nuevo access token con refresh token válido
authRoutes.post("/refresh", refreshHandler);

// POST /api/auth/logout  — invalidar refresh token
authRoutes.post("/logout", logoutHandler);

export { authRoutes };
