import { Router } from "express";
import { addSignatureHandler, createReportHandler, getCaseByIdHandler, getCasesHandler, processPayoutHandler } from "./cases.controller";

const casesRoutes = Router();

casesRoutes.post("/", createReportHandler);
casesRoutes.get("/", getCasesHandler);
casesRoutes.get("/:id", getCaseByIdHandler);
casesRoutes.post("/:id/signatures", addSignatureHandler);
casesRoutes.post("/:id/payout", processPayoutHandler);

export { casesRoutes };