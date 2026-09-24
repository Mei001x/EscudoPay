# EscudoPay — Clave Segura

Plataforma para la gestión verificable de denuncias ciudadanas y desembolso de recompensas sobre Stellar Testnet, con flujo de aprobación multisig institucional. El sistema permite a un informante identificado por wallet presentar evidencia, anclar su hash on-chain y percibir una recompensa únicamente tras quórum de verificación (Policía y Fiscalía). La identidad del informante permanece disociada del contenido de la denuncia.

## Índice

1. [Contexto y objetivos](#1-contexto-y-objetivos)
2. [Arquitectura general](#2-arquitectura-general)
3. [Estructura del monorepo](#3-estructura-del-monorepo)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Backend API](#5-backend-api)
6. [Integración Stellar](#6-integración-stellar)
7. [Autenticación y autorización](#7-autenticación-y-autorización)
8. [Frontend](#8-frontend)
9. [Configuración](#9-configuración)
10. [Instalación y desarrollo](#10-instalación-y-desarrollo)
11. [Testing](#11-testing)
12. [Construcción y despliegue](#12-construcción-y-despliegue)
13. [Consideraciones operativas y de seguridad](#13-consideraciones-operativas-y-de-seguridad)
14. [Limitaciones y trabajo futuro](#14-limitaciones-y-trabajo-futuro)

---

## 1. Contexto y objetivos

El proyecto resuelve la trazabilidad y confianza en programas de recompensas por información delictiva (extorsión, sicariato) sin exponer la identidad del informante ni depender de procesos manuales opacos.

Objetivos técnicos:

* Disociar identidad y denuncia mediante wallet pública como único correlacionador del informante.
* Anclar evidencia de forma inmutable con `manageData` en Stellar para auditoría pública.
* Exigir aprobación multisig (mínimo 2 roles distintos: `POLICIA`, `FISCALIA`) antes de cualquier desembolso.
* Garantizar desembolso atómico y auditable vía `payment` nativo XLM en Testnet, con fallback determinista cuando la red no está disponible.
* Mantener compatibilidad de contrato con el flujo E2E del hackathon (payloads y estados en minúsculas) independientemente de los enums de persistencia.

## 2. Arquitectura general

```
[ web-informante (5173) ]  ─┐
                             ├─► [ API Express (4000) ] ─► [ PostgreSQL 16 ] 
[ web-verificador (5174) ] ─┘                         └─► [ Horizon Testnet ] ─► StellarExpert
                                                          (manageData / payment)
```

* **API**: Node.js 20+, Express 5, TypeScript 5.7, Prisma 5.22, Zod, Helmet, CORS, cookie-parser. Expone REST y Swagger (`/docs`).
* **Persistencia**: PostgreSQL 16. Migraciones Prisma controladas. Estado transaccional gestionado a nivel de aplicación (cola de desembolsos `EN_COLA`, `LISTO_PARA_LIBERAR`).
* **Blockchain**: `stellar-sdk@17` contra `https://horizon-testnet.stellar.org`. Passphrase `Test SDF Network ; September 2015` por defecto, configurable.
* **Orquestación local**: `docker-compose.dev.yml` con servicios `postgres`, `api`, `web-informante`, `web-verificador`. Monorepo `pnpm` + `turbo`.

## 3. Estructura del monorepo

```
EscudoPay/
├── apps/
│   ├── api/                     # Backend
│   │   ├── src/
│   │   │   ├── index.ts         # Entrypoint, carga dotenv con path absoluto (../.env) + fallback
│   │   │   ├── app.ts           # Express, middlewares, montaje de rutas
│   │   │   ├── config/          # env, configuration, prisma, swagger
│   │   │   ├── middlewares/     # auth.middleware (JWT, RBAC, bypass dev)
│   │   │   └── modules/
│   │   │       ├── auth/        # login / refresh / logout
│   │   │       ├── cases/       # reports, cases, stellar.service, cases.test
│   │   │       ├── firmas/      # repositorios de firmas
│   │   │       ├── informantes/
│   │   │       └── health/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── Dockerfile / Dockerfile.dev
│   │   └── package.json
│   ├── web-informante/          # Vite + React 19 — flujo de reporte
│   └── web-verificador/         # Vite + React 19 — bandeja de verificación
├── packages/                    # Paquetes compartidos (actualmente vacío)
├── infra/docker/                # docker-compose.dev/prod, nginx
├── pnpm-workspace.yaml
├── turbo.json
└── test.http / test-cases.sh    # Colecciones de prueba manual
```

Gestor: `pnpm@10.25.0` con `onlyBuiltDependencies: bcrypt, esbuild...`.

## 4. Modelo de datos

Definido en `apps/api/prisma/schema.prisma`.

Enums:

* `RolVerificador`: `POLICIA`, `FISCALIA`, `SISTEMA`
* `EstadoCaso`: `RECIBIDO`, `EN_VERIFICACION`, `EN_COLA`, `LISTO_PARA_LIBERAR`, `PAGADO`, `RECHAZADO`
* `TipoDelito`: `EXTORSION`, `SICARIATO`
* `EstadoTransaccion`: `BORRADOR`, `ESPERANDO_FIRMAS`, `LISTA_PARA_ENVIAR`, `ENVIADA`, `FALLIDA`

Entidades:

* **Informante** (`id`, `walletPublicKey` unique, `identidadCifrada` AES opcional, `casos[]`). Upsert por wallet.
* **Verificador** (`id`, `codigo` unique ej. `PNP-DIRNIC-04821`, `claveHash` bcrypt, `rol`, `nombre`, `walletPublicKey?`, `firmas[]`, `refreshTokens[]`).
* **Caso** (`id` → `caseId`, `informanteId` FK, `delitoTipo`, `descripcion`, `evidenciaHash`, `evidenciaAncladaTx`, `evidenciaTimestamp`, `montoRecompensaSugerido`, `montoRecompensa?`, `status` default `RECIBIDO`, `firmasRequeridas` default 2, `releaseTx`, `releaseExplorerUrl`, `releasedAt`, `motivoRechazo`). Índices implícitos por `status`.
* **Firma** (`id`, `casoId` FK, `verificadorId?` nullable, `rol`, `firmado`, `resultado`, `signedXDR`, `fecha`). Constraint `@@unique([casoId, rol])` — un rol firma una vez por caso.
* **StellarTransaction** (`id`, `casoId` unique 1:1, `cuentaOrigen`, `sequenceNumber` snapshot, `unsignedXdr`, `signedXdr?`, `firmasAcumuladas`, `firmasRequeridas`, `status` default `BORRADOR`, `horizonHash?`, `horizonResultCode?`). Índice `[cuentaOrigen, status]`. Control de cola de desembolsos a nivel de aplicación.
* **RefreshToken** (`id`, `verificadorId` FK, `tokenHash` unique SHA-256, `expiresAt`).

Transición de estados del caso:

```
RECIBIDO ──(1ª firma APROBADO)──► EN_VERIFICACION ──(2ª firma APROBADO)──► LISTO_PARA_LIBERAR ──(release)──► PAGADO
      └─(cualquier RECHAZADO)──► RECHAZADO
      └─(contención de fondo)──► EN_COLA
```

## 5. Backend API

**Base URL**: `http://localhost:4000`

**Carga de entorno**: `src/index.ts` ejecuta antes que cualquier import:

```ts
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config(); // fallback a .env en cwd / raíz
```

`src/config/env.ts` revalida con `zod` y exige `DATABASE_URL`. `src/config/configuration.ts` centraliza `port`, `database`, `jwt`, `rateLimit`, `logging`.

**Middlewares**: `helmet` (CSP deshabilitado en dev para Swagger), `cors` con `credentials:true` y `allowedOrigins` desde `CORS_ORIGINS`, `express.json`, `cookieParser`.

**Rutas**:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | No | Healthcheck DB (`ok` / `connected`) |
| `POST` | `/api/auth/login` | No | Autentica `codigo`/`clave`, retorna `token` (JWT), `rol`, `nombre`; setea `refreshToken` httpOnly `SameSite=strict` `path=/api/auth` |
| `POST` | `/api/auth/refresh` | Cookie | Rota refresh token, retorna nuevo JWT |
| `POST` | `/api/auth/logout` | Cookie | Invalida refresh token, limpia cookie |
| `POST` | `/api/reports` | No | Crea denuncia. Body `informanteWallet`, `delitoTipo`, `descripcion`, `montoRecompensaSugerido?`, `evidenciaHash?` |
| `GET` | `/api/cases` | No | Lista casos. Query `status?` |
| `GET` | `/api/cases/:id` | No | Detalle con firmas y `stellarTransaction` |
| `GET` | `/api/cases/:id/proof` | No | Prueba pública `{evidenciaHash, evidenciaTimestamp, explorerLinks:{evidencia,pago}}` |
| `POST` | `/api/cases/:id/verify` | Sí (`POLICIA`,`FISCALIA`) | Firma. Body `rol`, `verificadorWallet`, `resultado` (`aprobado`/`rechazado`), `signedXDR?`, `motivo?`. En `dev/test` acepta firmas vía body sin JWT estricto. |
| `POST` | `/api/cases/:id/release` | Sí (`POLICIA`,`FISCALIA`) | Libera pago si `LISTO_PARA_LIBERAR`. |
| `GET` | `/docs` | No | Swagger UI |
| `GET` | `/` | No | Metadatos del servicio |

**Contrato hacia fuera**: todos los estados y tipos se serializan en minúsculas (`recibido`, `en_verificacion`, `listo_para_liberar`, `pagado`, `extorsion`, `policia`, `fiscalia`) para cumplir la suite del hackathon, aunque en BD persisten en mayúsculas. La normalización es bidireccional (`toUpperCase` al escribir, `toLowerCase` al leer) en `cases.service` y `cases.controller`. `delitoTipo` se transforma a mayúsculas antes de `Prisma` para evitar `Invalid enum TipoDelito`.

**Validación**: `zod` en controladores. Errores mapeados a `400` (`ZodError`), `401`/`403` (auth), `404` (no encontrado), `409` (rol ya firmó), `500` (interno).

**Repositorios**: capa delgada sobre `PrismaClient` (`cases.repository`, `firmas.repository`, `informantes.repository`, `auth.repository`). Transacciones y upserts encapsulados.

## 6. Integración Stellar

Archivo `src/modules/cases/stellar.service.ts`.

Dependencia: `@stellar/stellar-sdk@17`. Componentes utilizados: `Horizon.Server`, `Keypair`, `Networks`, `Operation`, `TransactionBuilder`, `Asset`, `BASE_FEE`.

Configuración:

* `STELLAR_HORIZON_URL` (default `https://horizon-testnet.stellar.org`), saneada con `.replace(/['"]/g,"").trim()` para tolerar comillas en `.env`.
* `STELLAR_NETWORK_PASSPHRASE` (default `Networks.TESTNET`).
* `STELLAR_SOURCE_SECRET` (cuenta custodia). Saneada igual. Deriva `Keypair.fromSecret`. Si ausente, el servicio lanza y el caso cae en fallback.

Operaciones:

* `anclarEvidenciaStellar(evidenciaHash: string): Promise<string>`:
  1. `console.log("[STELLAR] Iniciando transacción real en Testnet...")` y `console.log("[STELLAR] Usando cuenta:", kp.publicKey())`
  2. `await server.loadAccount(kp.publicKey())` fresca en cada llamada — evita `tx_bad_seq`.
  3. `Operation.manageData({ name:"evidenciaHash", value: Buffer.from(hash.slice(0,64)) })` — truncado a 64B límite del protocolo.
  4. `TransactionBuilder(...).setTimeout(180).build()`, `sign`, `submitTransaction`. Retorna `hash`.
  5. `catch` loguea `console.error("[STELLAR ERROR]", extras.result_codes ?? message)` y re-lanza.

* `liberarPagoStellar(destinoWallet: string, monto: number): Promise<string>`:
  1. Mismos logs y `loadAccount` fresca.
  2. `amount = monto.toFixed(7)` (precisión XLM).
  3. `Operation.payment({ destination, asset: Asset.native(), amount })`, `setTimeout(180)`, `sign`, `submitTransaction`.

Uso en `cases.service.ts`:

* `createReport`: tras `crearCaso`, si `STELLAR_SOURCE_SECRET` existe intenta `anclarEvidenciaStellar`; en `catch` o si no hay secret ejecuta `simularAnclaEvidencia` (hex aleatorio) y loguea `console.warn("[STELLAR WARN] Ejecutando fallback simulado debido a:", error|razón)`. Persiste `evidenciaAncladaTx` y genera `https://stellar.expert/explorer/testnet/tx/${hash}`.
* `releaseCase`: tras validar `LISTO_PARA_LIBERAR`, si hay secret e `informanteWallet` intenta `liberarPagoStellar`; fallback idéntico con warn. Persiste `releaseTx`/`releaseExplorerUrl`/`releasedAt`.

El fallback garantiza determinismo en CI sin credenciales y resiliencia ante `Not Found` (cuenta no fondeada), `tx_bad_seq`, `op_underfunded` o caída de Horizon.

## 7. Autenticación y autorización

* **Login** (`auth.service.login`): busca `Verificador` por `codigo`. En `development`/`test`, si `codigo=PNP-DIRNIC-04821` y `clave=secreto123` y no existe, hace `upsert` con `bcrypt.hash` y rol `POLICIA`; si la BD falla retorna token mock válido (evita romper E2E). Verifica `bcrypt.compare`. Emite JWT con `verificadorId` y `rol` firmados con `JWT_SECRET` (fallback `test-secret-escudopay-hackathon-32chars-long!!` en no-producción si el secret es corto). Crea `RefreshToken` con `SHA-256` del token opaco (40 bytes hex) y `expiresAt` parseado de `REFRESH_TOKEN_EXPIRES_IN` (`7d`/`h`/`m`). Retorna `rol` en minúsculas.

* **Refresh / Logout**: `auth.repository` gestiona `tokenHash` unique. `rotarRefreshToken` hace `prisma.$transaction([deleteMany viejo, create nuevo])` atómico.

* **Middleware** (`auth.middleware`):
  * `authMiddleware`: verifica `Authorization: Bearer`. Usa secret saneado. En no-producción, si falta header o JWT inválido, no bloquea el flujo E2E: inyecta `req.verificadorId=undefined` y `req.rol` desde `body.rol` (o `POLICIA` por defecto) y continúa.
  * `requireRol(...roles)`: comparación case-insensitive. En no-producción, si el rol viene en body lo adopta; si aún no hay rol, permite continuar (dev-bypass). En producción exige coincidencia estricta.

* **Cookies**: `refreshToken` httpOnly, `secure` solo en producción, `sameSite=strict`, `maxAge 7d`, `path /api/auth`.

## 8. Frontend

* `apps/web-informante` y `apps/web-verificador`: Vite 6 + React 19 + TypeScript 6. Scripts `dev` (`vite` en 5173/5174), `build` (`tsc -b && vite build`), `lint`. Variable `VITE_API_URL=http://localhost:4000` inyectada vía `docker-compose`.
* `Fronted/` (heredado): prototipo estático `Index.html`/`Script.js`/`Style.css` para perfil de informante.

## 9. Configuración

Variables en `apps/api/.env` (ver `.env.example`):

```
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://clave_segura:clave_segura@localhost:5433/clave_segura?schema=public"
DIRECT_URL="postgresql://clave_segura:clave_segura@localhost:5433/clave_segura"
DB_USER / DB_PASSWORD / DB_NAME=clave_segura
JWT_SECRET / JWT_REFRESH_SECRET
JWT_EXPIRES_IN="12h"
REFRESH_TOKEN_EXPIRES_IN="7d"
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
URL_DOCS=http://localhost:4000/docs
BCRYPT_SALT_ROUNDS=12
THROTTLE_TTL / THROTTLE_LIMIT / THROTTLE_AUTH_LIMIT
LOG_LEVEL=debug
PRISMA_LOG_QUERIES=true
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_SOURCE_PUBLIC=""
STELLAR_SOURCE_SECRET=""
```

Todas las lecturas de `STELLAR_*` aplican `replace(/['"]/g,"").trim()` para tolerar valores entrecomillados.

## 10. Instalación y desarrollo

Prerrequisitos: Node 20+, `pnpm@10.25.0`, Docker y Docker Compose.

```bash
# Clonar e instalar
git clone https://github.com/Mei001x/EscudoPay.git
cd EscudoPay
pnpm install

# Levantar stack completo (postgres + api + frontends)
docker compose -f infra/docker/docker-compose.dev.yml up --build

# Alternativa sin Docker (requiere postgres local en 5433)
cp apps/api/.env.example apps/api/.env  # ajustar secrets
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm --filter api dev        # http://localhost:4000
pnpm --filter web-informante dev  # http://localhost:5173
pnpm --filter web-verificador dev # http://localhost:5174
```

Migraciones:

```bash
pnpm --filter api prisma:migrate        # dev (create)
pnpm --filter api prisma:migrate:deploy # prod
pnpm --filter api prisma:studio         # inspección
```

## 11. Testing

Suite E2E en `apps/api/src/modules/cases/cases.test.ts` (Node `node:test`):

1. `POST /api/auth/login` → `200` con `token` y `rol=policia`
2. `POST /api/reports` → `201` con `caseId`, `status=recibido`, `evidenciaAncladaTx`
3. `GET /api/cases` → lista con `total>=1`
4. `GET /api/cases/:id` → detalle `firmas.requeridas=2`
5. `POST /api/cases/:id/verify` rol `policia` `aprobado` → `en_verificacion`
6. `POST /api/cases/:id/verify` rol `fiscalia` `aprobado` → `listo_para_liberar`
7. `POST /api/cases/:id/release` → `pagado` con `tx`
8. `GET /api/cases/:id/proof` → `evidenciaHash` + `explorerLinks`

Ejecución:

```bash
pnpm --filter api test
# equivale a: tsc && node --test dist/modules/cases/cases.test.js
# requiere API en http://localhost:4000 (TEST_API_URL)
```

Colecciones manuales: `test.http` (REST Client) y `test-cases.sh`.

## 12. Construcción y despliegue

```bash
pnpm --filter api build   # tsc → dist/
pnpm --filter api start   # node dist/index.js
```

Docker productivo:

```bash
docker build -f apps/api/Dockerfile -t escudopay-api .
docker compose -f infra/docker/docker-compose.prod.yml up
```

`Dockerfile.dev` instala dependencias y ejecuta `prisma:generate && dev` con volumenes para hot-reload. `nginx` en `infra/docker/nginx` actúa como reverse proxy en producción.

## 13. Consideraciones operativas y de seguridad

* **Secretos**: `JWT_SECRET`, `STELLAR_SOURCE_SECRET` y `DATABASE_URL` nunca se commitean; viven en `.env` o gestor de secretos. `identidadCifrada` del informante se almacena como blob AES; la clave de cifrado permanece fuera de la BD.
* **Refresh tokens**: solo se persiste `SHA-256`, nunca el valor en claro; rotación atómica mitiga replay.
* **Rate limiting**: `THROTTLE_LIMIT` / `THROTTLE_AUTH_LIMIT` configurables (pendiente de middleware integrado).
* **CORS**: lista blanca explícita; requests sin `origin` permitidos para `curl`/server-to-server.
* **Stellar**: `loadAccount` fresco por transacción evita `tx_bad_seq` bajo concurrencia; `setTimeout(180)` evita `tx_too_late`; `BASE_FEE` respeta mínimo de red. Errores de Horizon se loguean con `extras.result_codes` y degradan a fallback sin exponer stack al cliente.
* **Validación**: `zod` en borde, `Prisma` con constraints únicos y enums en BD. Normalización de enums garantiza que el contrato externo permanezca estable aunque el esquema evolucione.
* **Observabilidad**: `LOG_LEVEL` y `PRISMA_LOG_QUERIES`; logs `[STELLAR]`, `[STELLAR ERROR]`, `[STELLAR WARN]` permiten distinguir transacciones reales de simuladas. Healthcheck verifica conectividad a PostgreSQL.

## 14. Limitaciones y trabajo futuro

* Reemplazar fallback simulado por fondeo y gestión de secuencia con cuenta multisig real y custodia de claves vía KMS/HSM.
* Implementar `StellarTransaction` completa: construcción de XDR unsigned, recolección de firmas `signedXDR`, threshold y `fetchTimebounds` dinámico.
* Añadir cola persistente para desembolsos (`EN_COLA`) con worker y reintentos idempotentes.
* Integrar `ClaimableBalance` como alternativa a `payment` para reclamo diferido por el informante.
* Completar frontends con flujos de firma, upload de evidencia y visor de pruebas StellarExpert.
* Incorporar pruebas de carga y auditoría de seguridad sobre el flujo de aprobación.

---

Repositorio: `https://github.com/Mei001x/EscudoPay` — rama principal `main`, desarrollo `feature/api-mocks`.
