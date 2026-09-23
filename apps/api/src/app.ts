import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/configuration";
import { swaggerSpec } from "./config/swagger";
import { healthRoutes } from "./modules/health/health.routes";
import { casesRoutes } from "./modules/cases/cases.routes";
import { authRoutes } from "./modules/auth/auth.routes";

const app = express();
const httpServer = http.createServer(app);

app.use(cors());
app.use(helmet());
app.use(express.json());

// Endpoints
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", casesRoutes);
app.use("/api/cases", casesRoutes);

// Ruta Raíz
app.get('/', (request, response) => {
  response.json({
    description: 'Proyecto Clave Segura - API',
    version: '1.0.0',
    author: [
      {
        name: 'David Chavarria',
        userGit: '@Dave0097-hdz'
      }
    ],
    documentation: config.docs.urlDocs,
    api_endpoint: `http://localhost:${config.port}`,
    environment: config.env
  })
})

export { httpServer };