import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config(); // fallback a la raíz

import { config } from './config/configuration';
import { httpServer } from './app';
import { prisma } from './config/prisma';

async function startServer() {
  await prisma.$connect();
  await new Promise<void>((resolve) => httpServer.listen(config.port, '0.0.0.0', resolve));

  console.log(`🚀 Servidor iniciado en puerto: ${config.port}`)
  console.log(`🌐 Entorno: ${config.env}`)

  if (config.env === 'production') {
    console.log('🔐 URL de producción: http://localhost:4000')
    console.log('📚 Docs: http://localhost:4000/docs')
    console.log('❤️  Health: http://localhost:4000/api/health')
  } else {
    console.log(`🔐 URL local: http://localhost:${config.port}`)
    console.log(`📚 Docs: http://localhost:${config.port}/docs`)
    console.log(`❤️  Health: http://localhost:${config.port}/api/health`)
  }
}

startServer().catch(async (error) => {
  console.error('Error al iniciar el servidor:', error);
  await prisma.$disconnect();
  process.exitCode = 1;
});

const shutdown = async () => {
  httpServer.close();
  await prisma.$disconnect();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
