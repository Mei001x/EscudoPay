import { Router } from "express";
import { createReportHandler } from "./cases.controller";

const casesRoutes = Router();

casesRoutes.post("/", createReportHandler);

export { casesRoutes };