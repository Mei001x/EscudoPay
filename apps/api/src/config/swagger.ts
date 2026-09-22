import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "ClaveSegura API",
      version: "1.0.0",
      description: "API para la gestión verificable de recompensas mediante Stellar Testnet.",
    },
    servers: [{ url: "http://localhost:4000" }],
    tags: [{ name: "health", description: "Estado de la API y PostgreSQL" }],
    paths: {
      "/api/health": {
        get: {
          summary: "Verifica la disponibilidad de la API y PostgreSQL",
          tags: ["health"],
          responses: {
            "200": {
              description: "API y base de datos operativas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["status", "db"],
                    properties: {
                      status: { type: "string", example: "ok" },
                      db: { type: "string", example: "connected" },
                    },
                  },
                },
              },
            },
            "503": {
              description: "La base de datos no está disponible",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "error" },
                      db: { type: "string", example: "disconnected" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
});