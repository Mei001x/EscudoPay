import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import http from "http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/configuration";
import { swaggerSpec } from "./config/swagger";
import { healthRoutes } from "./modules/health/health.routes";
import { reportsRoutes } from "./modules/cases/reports.routes";
import { casesRoutes } from "./modules/cases/cases.routes";
import { authRoutes } from "./modules/auth/auth.routes";

const app = express();
const httpServer = http.createServer(app);

// ── Origins permitidos (dev: ambos frontends; prod: subdominios reales) ──
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (ej. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // En desarrollo/test: permitir cualquier origen (pitch / Fronted estático en 8080 / Vite 5173/5174)
      if (config.env !== "production") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin no permitido — ${origin}`));
    },
    credentials: true, // necesario para que las cookies httpOnly viajen
  }),
);

app.use(
  helmet({
    // Permite que Swagger UI cargue sus assets inline
    contentSecurityPolicy: config.env === "production" ? undefined : false,
  }),
);

app.use(express.json());
app.use(cookieParser()); // necesario para leer req.cookies

// ── Endpoints ────────────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);  // solo POST /api/reports
app.use("/api/cases", casesRoutes);      // GET, GET/:id, /:id/verify, /:id/release, /:id/proof

// ── Ruta raíz informativa ────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    description: "Proyecto Clave Segura - API",
    version: "1.0.0",
    author: [{ name: "David Chavarria", userGit: "@Dave0097-hdz" }],
    documentation: config.docs.urlDocs,
    api_endpoint: `http://localhost:${config.port}`,
    environment: config.env,
  });
});

export { httpServer };
