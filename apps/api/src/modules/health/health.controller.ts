import type { Request, Response } from "express";
import { checkHealth } from "./health.service";

export async function getHealth(_request: Request, response: Response) {
  try {
    const health = await checkHealth();
    return response.status(200).json(health);
  } catch {
    return response.status(503).json({
      status: "error",
      db: "disconnected",
    });
  }
}