import { Router } from "express";
import { authMiddleware, requireRol } from "../../middlewares/auth.middleware";
import {
  getCasesHandler,
  getCaseByIdHandler,
  verifyCaseHandler,
  releaseCaseHandler,
  getCaseProofHandler,
} from "./cases.controller";

const casesRoutes = Router();

// Rutas públicas (no requieren JWT)
casesRoutes.get("/", getCasesHandler);
casesRoutes.get("/:id", getCaseByIdHandler);
casesRoutes.get("/:id/proof", getCaseProofHandler);

// Rutas protegidas — requieren JWT válido de POLICIA o FISCALIA
casesRoutes.post(
  "/:id/verify",
  authMiddleware,
  requireRol("POLICIA", "FISCALIA"),
  verifyCaseHandler,
);
casesRoutes.post(
  "/:id/release",
  authMiddleware,
  requireRol("POLICIA", "FISCALIA"),
  releaseCaseHandler,
);

export { casesRoutes };
