import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
  BASE_FEE,
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
    console.error(
      "[STELLAR ERROR]",
      err?.response?.data?.extras?.result_codes ?? err?.message ?? err,
    );
    throw err;
  }
}

/**
 * Libera el pago de recompensa vía payment nativo XLM.
 * Carga la cuenta fresca, envía Asset.native() con 7 decimales.
 * Retorna el hash de la transacción confirmada.
 */
export async function liberarPagoStellar(
  destinoWallet: string,
  monto: number,
): Promise<string> {
  const server = getServer();
  const keypair = getSourceKeypair();

  console.log("[STELLAR] Iniciando transacción real en Testnet...");
  console.log("[STELLAR] Usando cuenta:", keypair.publicKey());

  const account = await server.loadAccount(keypair.publicKey());

  const amount = monto.toFixed(7);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destinoWallet,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(180)
    .build();

  tx.sign(keypair);
  try {
    const result = await server.submitTransaction(tx);
    return (result as any).hash as string;
  } catch (err: any) {
    console.error(
      "[STELLAR ERROR]",
      err?.response?.data?.extras?.result_codes ?? err?.message ?? err,
    );
    throw err;
  }
}
