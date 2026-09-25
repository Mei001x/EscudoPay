import { Router } from "express";
import { createReportHandler } from "./cases.controller";

const reportsRoutes = Router();

// POST /api/reports — el informante reporta información
reportsRoutes.post("/", createReportHandler);

export { reportsRoutes };
