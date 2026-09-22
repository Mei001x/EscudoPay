-- CreateEnum
CREATE TYPE "RolVerificador" AS ENUM ('POLICIA', 'FISCALIA', 'SISTEMA');

-- CreateEnum
CREATE TYPE "EstadoCaso" AS ENUM ('RECIBIDO', 'EN_VERIFICACION', 'EN_COLA', 'LISTO_PARA_LIBERAR', 'PAGADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoDelito" AS ENUM ('EXTORSION', 'SICARIATO');

-- CreateEnum
CREATE TYPE "EstadoTransaccion" AS ENUM ('BORRADOR', 'ESPERANDO_FIRMAS', 'LISTA_PARA_ENVIAR', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "Informante" (
    "id" TEXT NOT NULL,
    "walletPublicKey" TEXT NOT NULL,
    "identidadCifrada" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Informante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verificador" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "claveHash" TEXT NOT NULL,
    "rol" "RolVerificador" NOT NULL,
    "nombre" TEXT NOT NULL,
    "walletPublicKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caso" (
    "id" TEXT NOT NULL,
    "informanteId" TEXT NOT NULL,
    "delitoTipo" "TipoDelito" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "evidenciaHash" TEXT NOT NULL,
    "evidenciaAncladaTx" TEXT,
    "evidenciaTimestamp" TIMESTAMP(3),
    "montoRecompensaSugerido" INTEGER NOT NULL,
    "montoRecompensa" INTEGER,
    "status" "EstadoCaso" NOT NULL DEFAULT 'RECIBIDO',
    "claimableBalanceId" TEXT,
    "firmasRequeridas" INTEGER NOT NULL DEFAULT 2,
    "releaseTx" TEXT,
    "releaseExplorerUrl" TEXT,
    "releasedAt" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firma" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "verificadorId" TEXT,
    "rol" "RolVerificador" NOT NULL,
    "firmado" BOOLEAN NOT NULL DEFAULT false,
    "resultado" TEXT,
    "signedXDR" TEXT,
    "fecha" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StellarTransaction" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "cuentaOrigen" TEXT NOT NULL,
    "sequenceNumber" TEXT NOT NULL,
    "unsignedXdr" TEXT NOT NULL,
    "signedXdr" TEXT,
    "firmasAcumuladas" INTEGER NOT NULL DEFAULT 0,
    "firmasRequeridas" INTEGER NOT NULL DEFAULT 2,
    "status" "EstadoTransaccion" NOT NULL DEFAULT 'BORRADOR',
    "horizonHash" TEXT,
    "horizonResultCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StellarTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Informante_walletPublicKey_key" ON "Informante"("walletPublicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Verificador_codigo_key" ON "Verificador"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Firma_casoId_rol_key" ON "Firma"("casoId", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "StellarTransaction_casoId_key" ON "StellarTransaction"("casoId");

-- CreateIndex
CREATE INDEX "StellarTransaction_cuentaOrigen_status_idx" ON "StellarTransaction"("cuentaOrigen", "status");

-- AddForeignKey
ALTER TABLE "Caso" ADD CONSTRAINT "Caso_informanteId_fkey" FOREIGN KEY ("informanteId") REFERENCES "Informante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "Caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_verificadorId_fkey" FOREIGN KEY ("verificadorId") REFERENCES "Verificador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StellarTransaction" ADD CONSTRAINT "StellarTransaction_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "Caso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
