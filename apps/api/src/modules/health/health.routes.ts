import { Router } from "express";
import { getHealth } from "./health.controller";

export const healthRoutes = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Verifica la disponibilidad de la API y PostgreSQL
 *     tags:
 *       - health
 *     responses:
 *       200:
 *         description: API y base de datos operativas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - db
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 db:
 *                   type: string
 *                   example: connected
 *       503:
 *         description: La base de datos no está disponible
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 db:
 *                   type: string
 *                   example: disconnected
 */
healthRoutes.get("/", getHealth);