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
    tags: [
      { name: "health", description: "Healthcheck de la API" },
      { name: "cases", description: "Gestión de denuncias, firmas multisig y desembolsos" },
    ],
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
      "/api/reports": {
        post: {
          summary: "Crear nueva denuncia",
          tags: ["cases"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["informanteWallet", "delitoTipo", "descripcion"],
                  properties: {
                    informanteWallet: { type: "string", example: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7" },
                    delitoTipo: { type: "string", example: "extorsion" },
                    descripcion: { type: "string", example: "Sospechoso identificado en zona comercial" },
                    montoRecompensaSugerido: { type: "number", example: 3000 },
                    evidenciaHash: { type: "string", example: "abc123hash" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Denuncia creada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      caseId: { type: "string", format: "uuid" },
                      informanteWallet: { type: "string" },
                      delitoTipo: { type: "string" },
                      descripcion: { type: "string" },
                      status: { type: "string", example: "recibido" },
                      evidenciaAncladaTx: { type: "string" },
                      explorerUrl: { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                      montoRecompensaSugerido: { type: "number" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Datos de reporte inválidos",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Datos de reporte inválidos" },
                      details: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cases": {
        get: {
          summary: "Listar denuncias",
          tags: ["cases"],
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Filtrar por status (ej: recibido, en_verificacion, aprobado, pagado)",
            },
          ],
          responses: {
            "200": {
              description: "Lista de casos",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      total: { type: "integer", example: 1 },
                      casos: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            caseId: { type: "string" },
                            delitoTipo: { type: "string" },
                            status: { type: "string" },
                            montoRecompensa: { type: "number" },
                            createdAt: { type: "string", format: "date-time" },
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
      },
      "/api/cases/{id}": {
        get: {
          summary: "Obtener caso por ID",
          tags: ["cases"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID del caso",
            },
          ],
          responses: {
            "200": {
              description: "Detalle del caso con quórum de firmas",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      caseId: { type: "string" },
                      informanteWallet: { type: "string" },
                      delitoTipo: { type: "string" },
                      descripcion: { type: "string" },
                      status: { type: "string" },
                      evidenciaAncladaTx: { type: "string" },
                      explorerUrl: { type: "string" },
                      createdAt: { type: "string" },
                      montoRecompensa: { type: "number" },
                      montoRecompensaSugerido: { type: "number" },
                      firmas: {
                        type: "object",
                        properties: {
                          requeridas: { type: "integer", example: 2 },
                          obtenidas: { type: "integer", example: 0 },
                          detalle: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                rol: { type: "string", enum: ["policia", "fiscal"] },
                                firmado: { type: "boolean" },
                                fecha: { type: "string", nullable: true },
                                signerWallet: { type: "string", nullable: true },
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
            "404": {
              description: "Caso no encontrado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Caso no encontrado" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cases/{id}/signatures": {
        post: {
          summary: "Registrar firma policial/fiscal",
          tags: ["cases"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID del caso",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["signerWallet", "rol"],
                  properties: {
                    signerWallet: { type: "string", example: "G_POLICIA_WALLET_TESTNET_KEY_12345" },
                    rol: { type: "string", enum: ["policia", "fiscal"] },
                    decision: { type: "string", enum: ["aprobar", "rechazar"], default: "aprobar" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Firma procesada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      caseId: { type: "string" },
                      status: { type: "string" },
                      firmas: { type: "object" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Ya firmó o datos inválidos",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Este rol ya firmó el caso" },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Caso no encontrado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Caso no encontrado" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cases/{id}/payout": {
        post: {
          summary: "Procesar desembolso de recompensa",
          tags: ["cases"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID del caso",
            },
          ],
          responses: {
            "200": {
              description: "Recompensa pagada",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      caseId: { type: "string" },
                      recipientWallet: { type: "string" },
                      amount: { type: "number" },
                      status: { type: "string", example: "pagado" },
                      payoutTxHash: { type: "string" },
                      payoutExplorerUrl: { type: "string" },
                      paidAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "No aprobado o ya pagado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "El caso no cuenta con las aprobaciones necesarias para el desembolso",
                      },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Caso no encontrado",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string", example: "Caso no encontrado" },
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
