import { Router } from "express";
import { createReportHandler, getCaseByIdHandler, getCasesHandler } from "./cases.controller";

const casesRoutes = Router();

casesRoutes.post("/", createReportHandler);
casesRoutes.get("/", getCasesHandler);
casesRoutes.get("/:id", getCaseByIdHandler);

export { casesRoutes };