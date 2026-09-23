import { Router } from "express";
import {
  createReportHandler,
  getCasesHandler,
  getCaseByIdHandler,
  verifyCaseHandler,
  releaseCaseHandler,
  getCaseProofHandler,
} from "./cases.controller";

const casesRoutes = Router();

casesRoutes.post("/", createReportHandler);
casesRoutes.get("/", getCasesHandler);
casesRoutes.get("/:id", getCaseByIdHandler);
casesRoutes.post("/:id/verify", verifyCaseHandler);
casesRoutes.post("/:id/release", releaseCaseHandler);
casesRoutes.get("/:id/proof", getCaseProofHandler);

export { casesRoutes };
