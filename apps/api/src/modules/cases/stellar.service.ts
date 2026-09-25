import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
  BASE_FEE,
  StrKey,
} from "@stellar/stellar-sdk";

/**
 * Config Horizon (Testnet por defecto).
 * Usa variables de entorno para permitir override en prod/staging.
 * Limpia comillas accidentales que pueden venir del .env.
 */
const HORIZON_URL = (
  process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
)
  .replace(/['"]/g, "")
  .trim();
const NETWORK_PASSPHRASE = (
  process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET
)
  .replace(/['"]/g, "")
  .trim();

/** Fee extra por operación, para que createAccount tenga aire tras crear. */
const CREATE_ACCOUNT_MIN_BALANCE = "1.5";

function getServer(): Horizon.Server {
  return new Horizon.Server(HORIZON_URL);
}

function getSourceKeypair(): Keypair {
  const secret = (process.env.STELLAR_SOURCE_SECRET ?? "")
    .replace(/['"]/g, "")
    .trim();
  if (!secret) {
    throw new Error("STELLAR_SOURCE_SECRET no configurada");
  }
  return Keypair.fromSecret(secret);
}

/**
 * Convierte un monto numérico a String con 7 decimales, como exige el SDK.
 * `Operation.payment` revienta la serialización XDR si `amount` es Number.
 */
function toStellarAmount(monto: number | string): string {
  const n = typeof monto === "string" ? Number(monto) : monto;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Monto inválido para Stellar: ${monto}`);
  }
  return n.toFixed(7);
}

/**
 * Valida que el destino sea una public key Ed25519 real.
 *
 * ESTA era la causa raíz del fallo "destination is invalid": la wallet
 * `GCDMECPA765W7L4QHVV6HVXH000...` del seed de demo tiene 56 caracteres y
 * empieza por G, PERO el checksum version-byte no cuadra, así que
 * `StrKey.isValidEd25519PublicKey` devuelve false y Horizon la rechaza con
 * `Account ID must start with G and contain 56 alphanum characters`.
 */
function assertValidDestination(destinoWallet: string): string {
  const w = String(destinoWallet ?? "").replace(/['"]/g, "").trim();
  if (!StrKey.isValidEd25519PublicKey(w)) {
    throw new Error(
      `Destino inválido: "${w}" no es una public key Ed25519 válida ` +
        `(formato G... de 56 chars con checksum correcto).`,
    );
  }
  return w;
}

/**
 * ¿Existe la cuenta en el ledger?
 * Una cuenta que nunca recibió fondos no existe → `Operation.payment` falla
 * con `op_no_destination`.
 */
export async function cuentaExisteEnLedger(
  publicKey: string,
): Promise<boolean> {
  try {
    await getServer().loadAccount(publicKey);
    return true;
  } catch (err: any) {
    if (err?.response?.status === 404) return false;
    throw err;
  }
}

/**
 * Log uniforme de errores de Horizon: imprime el result_code exacto
 * (op_no_destination, op_underfunded, tx_bad_seq, tx_failed, ...).
 */
function logStellarError(contexto: string, err: any): void {
  const codes = err?.response?.data?.extras?.result_codes;
  const txCodes = err?.response?.data?.extras?.result_codes_transactions;
  const opCodes = err?.response?.data?.extras?.result_codes_operations;
  console.error(`[STELLAR ERROR] ${contexto}`, {
    status: err?.response?.status,
    result_codes: codes,
    result_codes_transactions: txCodes,
    result_codes_operations: opCodes,
    title: err?.response?.data?.title,
    detail: err?.response?.data?.detail,
    message: err?.message,
  });
  if (Array.isArray(codes)) {
    const meaningful = codes.filter(
      (c: string) => c && c !== "tx_success" && c !== "op_success",
    );
    if (meaningful.length) {
      console.error(`[STELLAR ERROR] ${contexto} → causa: ${meaningful.join(", ")}`);
    }
  }
}

/**
 * Ancla el hash de evidencia on-chain vía manageData.
 * Carga la cuenta fresca en cada llamada para evitar tx_bad_seq.
 * Retorna el hash de la transacción confirmada en Horizon.
 */
export async function anclarEvidenciaStellar(
  evidenciaHash: string,
): Promise<string> {
  const server = getServer();
  const keypair = getSourceKeypair();

  console.log("[STELLAR] Iniciando transacción real en Testnet...");
  console.log("[STELLAR] Usando cuenta:", keypair.publicKey());

  // Cargar cuenta fresca — evita sequence number desfasado
  const account = await server.loadAccount(keypair.publicKey());

  // manageData value máx 64 bytes: truncamos y codificamos como Buffer
  const value = Buffer.from(evidenciaHash.slice(0, 64));

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.manageData({
        name: "evidenciaHash",
        value,
      }),
    )
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  try {
    const result = await server.submitTransaction(tx);
    // Horizon retorna { hash: string, ... }
    return (result as any).hash as string;
  } catch (err: any) {
    logStellarError("anclarEvidencia (manageData)", err);
    throw err;
  }
}

/**
 * Libera el pago de recompensa vía operación nativa XLM.
 *
 * Estrategia:
 *  1. Valida el destino (StrKey Ed25519 + checksum) → error claro si es falso.
 *  2. Comprueba si la cuenta destino existe en el ledger:
 *     - NO existe → `Operation.createAccount` con startingBalance = monto
 *       (crea la cuenta Y entrega el pago en una sola tx, evitando
 *        `op_no_destination`).
 *     - sí existe  → `Operation.payment`.
 *  3. `amount` SIEMPRE como String con 7 decimales.
 *
 * Retorna el hash de la transacción confirmada en Horizon.
 */
export async function liberarPagoStellar(
  destinoWallet: string,
  monto: number,
): Promise<string> {
  const server = getServer();
  const keypair = getSourceKeypair();
  const destino = assertValidDestination(destinoWallet);
  const amount = toStellarAmount(monto); // String "50.0000000"

  console.log("[STELLAR] Iniciando transacción real en Testnet...");
  console.log("[STELLAR] Usando cuenta:", keypair.publicKey());
  console.log("[STELLAR] Destino:", destino, "| amount:", amount, `(${typeof amount})`);

  // Cuenta fresca — evita tx_bad_seq
  const account = await server.loadAccount(keypair.publicKey());

  const existe = await cuentaExisteEnLedger(destino);

  let operacion: ReturnType<typeof Operation.createAccount> | ReturnType<typeof Operation.payment>;

  if (existe) {
    console.log("[STELLAR] Destino existe en el ledger → Operation.payment");
    operacion = Operation.payment({
      destination: destino,
      asset: Asset.native(),
      amount, // String
    });
  } else {
    // Causa A: cuenta inexistente → op_no_destination.
    // createAccount la crea y le abona el monto en la misma transacción.
    console.log(
      "[STELLAR] Destino NO existe en el ledger → Operation.createAccount (evita op_no_destination)",
    );
    operacion = Operation.createAccount({
      destination: destino,
      startingBalance: amount, // String
    });
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operacion)
    .setTimeout(180)
    .build();

  tx.sign(keypair);

  try {
    const result = await server.submitTransaction(tx);
    const hash = (result as any).hash as string;
    console.log(
      `[STELLAR OK] ${existe ? "payment" : "createAccount"} enviado`,
      { destino, amount, hash },
    );
    return hash;
  } catch (err: any) {
    logStellarError(`liberarPago (${existe ? "payment" : "createAccount"})`, err);

    // Último recurso: si la cuenta se creó sin saldo útil, reintentar
    // con createAccount sólo si aún no existe.
    const codes: string[] = err?.response?.data?.extras?.result_codes ?? [];
    if (codes.includes("op_no_destination") && !existe) {
      throw new Error(
        "op_no_destination: la cuenta destino no pudo crearse. " +
          "Verifica que la public key sea válida y que la cuenta fuente tenga saldo.",
      );
    }
    throw err;
  }
}
