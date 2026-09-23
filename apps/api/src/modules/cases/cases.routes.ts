import { Router } from "express";
import {
  getCasesHandler,
  getCaseByIdHandler,
  verifyCaseHandler,
  releaseCaseHandler,
  getCaseProofHandler,
} from "./cases.controller";

const casesRoutes = Router();

// GET    /api/cases          — lista de casos (dashboard verificador)
casesRoutes.get("/", getCasesHandler);
// GET    /api/cases/:id      — detalle de un caso
casesRoutes.get("/:id", getCaseByIdHandler);
// POST   /api/cases/:id/verify  — verificador firma
casesRoutes.post("/:id/verify", verifyCaseHandler);
// POST   /api/cases/:id/release — liberar pago
casesRoutes.post("/:id/release", releaseCaseHandler);
// GET    /api/cases/:id/proof   — prueba pública para el demo
casesRoutes.get("/:id/proof", getCaseProofHandler);

export { casesRoutes };
