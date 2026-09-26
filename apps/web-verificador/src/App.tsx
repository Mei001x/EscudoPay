import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";

// ── Tipos ──────────────────────────────────────────────────
type CaseSummary = {
  caseId: string;
  delitoTipo: string;
  status: string;
  montoRecompensa: number;
  pagoSimulado?: boolean;
  createdAt: string;
};

type CaseDetail = {
  caseId: string;
  status: string;
  delitoTipo: string;
  evidenciaAncladaTx: string | null;
  releaseTx: string | null;
  pagoSimulado?: boolean;
  montoRecompensa: number;
  firmas: {
    requeridas: number;
    obtenidas: number;
    detalle: { rol: string | null; firmado: boolean; resultado: string | null; fecha: string | null }[];
  };
  stellarTransaction: unknown;
  createdAt: string;
};

type Proof = {
  evidenciaHash: string;
  evidenciaTimestamp: string | null;
  explorerLinks: { evidencia: string | null; pago: string | null };
};

/** Vistas del flujo ciudadano. 'autoridades' es un portal aparte, no un paso.
 *  No hay vista de perfil: las dos pestañas superiores ya dicen en qué
 *  puerta estás entrando, así que pedirlo otra vez es redundante. */
type ViewState = "list" | "detail" | "report" | "thanks" | "autoridades";

/**
 * Ficha del catálogo. `delitoTipo` es el enum que acepta la API
 * (TipoDelito: EXTORSION | SICARIATO) y `delito` su etiqueta en español:
 * la API rechaza cualquier otro valor, así que el catálogo no puede ofrecer
 * otros cargos sin extender el enum y migrar.
 */
type Buscado = {
  id: string;
  alias: string;
  esBanda: boolean;
  departamento: string;
  delito: string;
  delitoTipo: "EXTORSION" | "SICARIATO";
  descripcion: string;
  recompensaXlm: number;
  lugarRQ: string;
  sexo: string;
};

// ── Config ─────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL as string) || "";
// si VITE_API_URL es http://localhost:4000 usamos relativo para aprovechar proxy y evitar CORS
const apiUrl = (path: string) =>
  API_BASE ? `${API_BASE.replace(/\/$/, "")}${path}` : path;

// Wallet REAL de Testnet, validada con StrKey y fondeada vía friendbot.
// Es la que recibe el pago on-chain: si no es una public key Ed25519 con
// checksum válido, Operation.payment falla con "destination is invalid".
const DEMO_INFORMANTE_WALLET = "GAUP7AU33PW2KGEHAX2LCU7FTRTJVUXZ2U7F7X5QJFYXNSBRJ63HZPPV";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
// Cadencia del polling del balance. 30s mantiene el widget "en vivo" sin
// saturar Horizon (que aplica rate limit por IP) ni generar ruido en la red.
const BALANCE_POLL_MS = 30_000;
const PUBLIC_KEY_RE = /^G[A-Z0-9]{55}$/;

type HorizonBalance = { balance: string; asset_type: string };

type BalanceEstado =
  | { estado: "ok"; balance: string }
  | { estado: "invalida" } // 400: la public key no pasa el checksum de Stellar
  | { estado: "inexistente" } // 404: key válida, pero la cuenta no está en Testnet
  | { estado: "error" }; // red caída / Horizon 5xx

/**
 * Catálogo de requisitoriados para la demo. Los seis primeros vienen del
 * estático (Fronted/Script.js); los cuatro últimos son las organizaciones que
 * ya vivían en el selector objetivo. La recompensa se expresa en XLM, no en
 * soles, porque ése es el riel real de pago: el backend transfiere
 * exactamente caso.montoRecompensaSugerido en XLM al aprobar las firmas.
 */
const BUSCADOS: readonly Buscado[] = [
  {
    id: "condor",
    alias: "Alias 'El Cóndor'",
    esBanda: false,
    departamento: "Lima",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Cobro de cupo a comerciantes del Cercado de Lima.",
    recompensaXlm: 50,
    lugarRQ: "Lima",
    sexo: "Masculino",
  },
  {
    id: "serpiente",
    alias: "Alias 'La Serpiente'",
    esBanda: false,
    departamento: "Arequipa",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Amenazas a transportistas de la zona sur.",
    recompensaXlm: 30,
    lugarRQ: "Arequipa",
    sexo: "Femenino",
  },
  {
    id: "buho",
    alias: "Alias 'El Búho'",
    esBanda: false,
    departamento: "La Libertad",
    delito: "Sicariato",
    delitoTipo: "SICARIATO",
    descripcion: "Vinculado a ataques armados por encargo.",
    recompensaXlm: 100,
    lugarRQ: "Trujillo",
    sexo: "Masculino",
  },
  {
    id: "fantasma",
    alias: "Alias 'Fantasma 23'",
    esBanda: false,
    departamento: "Lima",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Cobro de cupo a negocios de construcción.",
    recompensaXlm: 45,
    lugarRQ: "Lima Este",
    sexo: "Masculino",
  },
  {
    id: "toro",
    alias: "Alias 'El Toro'",
    esBanda: false,
    departamento: "Piura",
    delito: "Cobro de cupo",
    delitoTipo: "EXTORSION",
    descripcion: "Exige pagos semanales a mototaxistas.",
    recompensaXlm: 25,
    lugarRQ: "Piura",
    sexo: "Masculino",
  },
  {
    id: "sombra",
    alias: "Alias 'La Sombra'",
    esBanda: false,
    departamento: "Callao",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Amenazas a comerciantes del mercado central.",
    recompensaXlm: 60,
    lugarRQ: "Callao",
    sexo: "Femenino",
  },
  {
    id: "pulpos",
    alias: "Los Pulpos",
    esBanda: true,
    departamento: "Lima",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Extorsión y cobro de cupos a comerciantes ambulantes.",
    recompensaXlm: 75,
    lugarRQ: "Cercado de Lima",
    sexo: "Banda organizada",
  },
  {
    id: "tren",
    alias: "El Tren de Aragua",
    esBanda: true,
    departamento: "Lima",
    delito: "Sicariato",
    delitoTipo: "SICARIATO",
    descripcion: "Facciones migratorias con Bari en la zona sur.",
    recompensaXlm: 120,
    lugarRQ: "Lima Sur",
    sexo: "Banda organizada",
  },
  {
    id: "injertos",
    alias: "Los Injertos del Cono Norte",
    esBanda: true,
    departamento: "Lima",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Red de cobro de cupos en el cono norte.",
    recompensaXlm: 90,
    lugarRQ: "Los Olivos",
    sexo: "Banda organizada",
  },
  {
    id: "noidentificada",
    alias: "Banda no identificada",
    esBanda: true,
    departamento: "Varios",
    delito: "Extorsión",
    delitoTipo: "EXTORSION",
    descripcion: "Grupo sin alias conocido que cobra cupos en la vía pública.",
    recompensaXlm: 50,
    lugarRQ: "Sin determinar",
    sexo: "Banda organizada",
  },
] as const;

/** Objetivos seleccionables en el formulario. Derivados del catálogo. */
const OBJETIVOS = BUSCADOS.map((b) => b.alias);

const formatXlm = (raw: string) =>
  parseFloat(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatXlmNumber = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Lee el balance nativo (XLM) directo de Horizon Testnet.
 * Se consulta la red y no nuestro backend a propósito: el ciudadano debe ver
 * el saldo real de la cuenta que va a recibir la recompensa, no una copia.
 *
 * Horizon no usa el mismo código para cada fallo, y todos son distintos de
 * "saldo 0.00":
 *   400 → la public key es inválida (checksum)      → no se puede cobrar
 *   404 → key válida pero la cuenta no está creada   → aún no se conoce
 *   5xx → Horizon no responde                        → aún no se conoce
 * Colapsarlos en "0.00" haría creer al ciudadano que su wallet está vacía.
 */
const fetchStellarBalance = async (walletAddress: string): Promise<BalanceEstado> => {
  try {
    const res = await fetch(`${HORIZON_TESTNET}/accounts/${walletAddress}`);
    if (res.status === 400) return { estado: "invalida" };
    if (res.status === 404) return { estado: "inexistente" };
    if (!res.ok) return { estado: "error" };
    const data = await res.json();
    const native = (data.balances as HorizonBalance[]).find((b) => b.asset_type === "native");
    return { estado: "ok", balance: native ? formatXlm(native.balance) : "0.00" };
  } catch (err) {
    console.error("Error al consultar saldo Stellar:", err);
    return { estado: "error" };
  }
};

type RolAutoridad = "policia" | "fiscalia";

const PNP_PAYLOAD = {
  rol: "policia",
  verificadorId: "PNP-DIRNIC-04821",
  verificadorWallet: DEMO_INFORMANTE_WALLET,
  resultado: "APROBADO" as const,
};
const FISCALIA_PAYLOAD = {
  rol: "fiscalia",
  verificadorId: "MP-FISC-99120",
  verificadorWallet: DEMO_INFORMANTE_WALLET,
  resultado: "APROBADO" as const,
};

/* Sesión de demo por autoridad. En producción el API exige un JWT en
   /verify y /release, así que hay que iniciar sesión antes de firmar. Las
   credenciales viven en el propio bundle: es un entorno de demostración con
   cuentas de prueba sembradas, no un sistema de acceso real. */
const DEMO_CREDENCIALES: Record<RolAutoridad, { codigo: string; clave: string }> = {
  policia: { codigo: PNP_PAYLOAD.verificadorId, clave: "secreto123" },
  fiscalia: { codigo: FISCALIA_PAYLOAD.verificadorId, clave: "secreto123" },
};

const tokensDemo = new Map<RolAutoridad, string>();

async function tokenDeDemo(rol: RolAutoridad): Promise<string> {
  const enCache = tokensDemo.get(rol);
  if (enCache) return enCache;

  const { codigo, clave } = DEMO_CREDENCIALES[rol];
  const r = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, clave }),
  });
  const j = await r.json().catch(() => ({}));
  const token = (j as { token?: string }).token;
  if (!r.ok || !token) {
    throw new Error(
      (j as { error?: string }).error || `No se pudo iniciar sesión (${r.status})`,
    );
  }
  tokensDemo.set(rol, token);
  return token;
}

/* Firma con reintento: si el token expiró (12 h) se descarta y se pide uno
   nuevo, en vez de dejar al usuario atascado con un 401. */
async function fetchAutorizado(
  rol: RolAutoridad,
  path: string,
  body: unknown,
): Promise<Response> {
  const enviar = (token: string) =>
    fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const r = await enviar(await tokenDeDemo(rol));
  if (r.status === 401) {
    tokensDemo.delete(rol);
    return enviar(await tokenDeDemo(rol));
  }
  return r;
}

/* Las dos mitades de la multisig. El panel las lista siempre, estén o no
   firmadas, para que el quorum se lea como "quién falta" y no como un
   número suelto. */
const QUORUM_SIGNERS = [
  { rol: "policia", label: "Policía Nacional", ref: "PNP-DIRNIC-04821" },
  { rol: "fiscalia", label: "Ministerio Público", ref: "MP-FISC-99120" },
];

/* Snippet mostrado en el inspector de consenso. Reproduce el orden real de
   `releaseCase()`: primero se cuenta el quorum en la base, y sólo si se
   alcanza se construye la transacción. Ese orden es el objeto de la
   inspección — no un ejemplo ilustrativo genérico. */
const QUORUM_CODE = `// apps/api/src/modules/cases/cases.service.ts
async function releaseCase(caseId: string) {
  const c = await obtenerCasoPorId(caseId);
  if (c.status === "PAGADO") throw new AlreadyPaid();

  // 1. El quorum se cuenta ANTES de construir la transacción.
  //    No existe tx que firmar si falta una de las dos firmas.
  const firmas = await contarFirmasValidas(caseId);   // firmado && APROBADO
  if (firmas < c.firmasRequeridas) {
    throw new QuorumError();                            // 400 — sin build
  }

  // 2. Sólo entonces se ensambla la tx. Soroban la ejecuta contra el
  //    contrato de custodia, que exige 2 de 2 sobre la multisig.
  return await escrow.invoke("release", {
    to: c.informante.walletPublicKey,
    amount: c.montoRecompensaSugerido,
    signers: [PNP, FISCALIA],        // multisig 2-de-2
    threshold: 2,
  });
}`;

function statusLabel(s: string) {
  const m: Record<string, string> = {
    recibido: "RECIBIDO",
    en_verificacion: "EN REVISIÓN",
    en_verificacíon: "EN REVISIÓN",
    en_revision: "EN REVISIÓN",
    listo_para_liberar: "LISTO PARA LIBERAR",
    pagado: "PAGADO",
    rechazado: "RECHAZADO",
    en_cola: "EN COLA",
  };
  const k = s.toLowerCase();
  return m[k] ?? s.toUpperCase();
}
function statusColor(s: string) {
  const k = s.toLowerCase();
  if (k === "pagado") return "#4ade80";
  if (k === "listo_para_liberar") return "#facc15";
  if (k === "en_verificacion" || k === "en_revision" || k === "en_verificacíon") return "#38bdf8";
  if (k === "recibido") return "#2dd9c4";
  if (k === "rechazado") return "#fb7185";
  return "#8fb8b3";
}

// Tono del badge: fondo 8%, borde 20%, texto saturado (ver index.css).
function statusTone(s: string) {
  const k = s.toLowerCase();
  if (k === "pagado") return "tone-pagado";
  if (k === "listo_para_liberar") return "tone-listo";
  if (k === "en_verificacion" || k === "en_revision" || k === "en_verificacíon") return "tone-revision";
  if (k === "recibido") return "tone-recibido";
  if (k === "rechazado") return "tone-rechazado";
  return "tone-default";
}

// Una sola familia de iconos, trazo 1.75, viewBox 24. Sustituye a los emoji.
const ICON_PATHS: Record<string, string> = {
  smartphone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  refresh: "M20 11a8 8 0 10-1.5 5.5M20 6v5h-5",
  check: "M4 12.5l5 5L20 6.5",
  alert: "M12 8.5v5M12 17h.01M10.3 4.2L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z",
  arrowUpRight: "M8 16L16 8M9 8h7v7",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  chevronRight: "M9 5l7 7-7 7",
  link: "M10.5 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L12 6.3M13.5 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5",
  wallet: "M3 8a2 2 0 012-2h12a2 2 0 012 2M3 8v9a2 2 0 002 2h14a2 2 0 002-2v-3M3 8h14a2 2 0 012 2v3h-5a2 2 0 010-4h5M17 9.5h.01",
  key: "M15.5 8.5a4 4 0 11-3.2 6.4L4 23.2V20h3v-3h3v-2.5h2.3l3-3a4 4 0 011.2-3z",
  inbox: "M3 13h5l1.5 3h5L16 13h5M4.5 5.5h15l1.5 7.5v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4l1.5-7.5z",
  send: "M21 3L10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3z",
  building: "M4 21V6a2 2 0 012-2h6a2 2 0 012 2v15M14 10h4a2 2 0 012 2v9M4 21h17M7.5 8h3M7.5 12h3M7.5 16h3",
  badge: "M12 3l2.5 1.8 3-.2.5 3 2.5 1.7-1.5 2.6 1.5 2.6-2.5 1.7-.5 3-3-.2L12 21l-2.5-1.8-3 .2-.5-3L3.5 15l1.5-2.6L3.5 8l2.5-1.7.5-3 3 .2L12 3zM9.5 12l1.8 1.8L15 10",
  unlock: "M7 11V7a5 5 0 019.5-2M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1zM12 15v2",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
};

function Icon({ name, size }: { name: keyof typeof ICON_PATHS | string; size?: number }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.alert;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/* Resaltador de sintaxis deliberadamente mínimo: comentarios, cadenas,
   números, palabras clave y llamadas. Se implementa aquí en vez de añadir
   un resaltador completo al bundle porque el drawer sólo muestra un snippet
   fijo de este archivo — 200 KB de librería para colorear 20 líneas no
   compensan. Si algún día el visor muestra código arbitrario, sustituir. */
function CodeView({ code }: { code: string }) {
  const re =
    /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b|\b(async|await|const|let|function|return|throw|new|if|else|import|export|from|type|interface|as|true|false|null|undefined)\b|([A-Za-z_$][\w$]*)(?=\()/g;

  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, str, num, kw, fn] = m;
    const cls = comment
      ? "c-com"
      : str
        ? "c-str"
        : num
          ? "c-num"
          : kw
            ? "c-kw"
            : fn
              ? "c-fn"
              : null;
    out.push(cls ? <span key={out.length} className={cls}>{text}</span> : text);
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));

  return (
    <pre className="code-view" tabIndex={0} aria-label="Regla de verificación de firmas">
      <code>{out}</code>
    </pre>
  );
}

export default function App() {
  // ── Navegación por vistas ────────────────────────────────
  // Arranca en el catálogo: la pestaña [Denunciar] es la puerta por defecto
  // y pedir perfil antes sobraba.
  const [vista, setVista] = useState<ViewState>("list");
  const [objetivoSel, setObjetivoSel] = useState<Buscado | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("");
  const [filtroDelito, setFiltroDelito] = useState("");
  const [adjuntos, setAdjuntos] = useState({ imagenes: 0, audio: 0, video: 0 });
  const [progreso, setProgreso] = useState(0);

  // ── Estado de auditoría (portal de autoridades) ───────────
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "info" } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [releaseResult, setReleaseResult] = useState<{ explorerUrl: string; tx: string; montoLiberado: number; simulado?: boolean } | null>(null);
  // ── Inspector de regla de consenso (drawer) ──────────────
  // Tres fases para poder animar la salida: montado mientras está "closing"
  // y desmontado al terminar, en vez de desaparecer de golpe.
  const [inspect, setInspect] = useState<null | "open" | "closing">(null);
  const [probe, setProbe] = useState<{ http: number | null; error: string | null } | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const inspectRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inspectWasOpen = useRef(false);

  const inspectOpen = inspect === "open";

  // Debe coincidir con `--drawer-out` en index.css.
  const DRAWER_EXIT_MS = 180;

  const openInspect = useCallback(() => {
    setProbe(null);
    setInspect("open");
  }, []);

  const closeInspect = useCallback(() => {
    setInspect((f) => (f ? "closing" : null));
    window.setTimeout(() => setInspect(null), DRAWER_EXIT_MS);
  }, []);

  // Al cambiar de caso, la sonda anterior ya no describe nada: se descarta.
  useEffect(() => {
    setProbe(null);
  }, [selectedId]);
  // ── Formulario de denuncia ───────────────────────────────
  const [reporte, setReporte] = useState({
    objetivo: "",
    delitoTipo: "EXTORSION",
    descripcion: "",
    monto: "50",
    wallet: DEMO_INFORMANTE_WALLET,
  });
  const [reporteEnviando, setReporteEnviando] = useState(false);
  const [reporteOk, setReporteOk] = useState<{ caseId: string; explorerUrl: string; tx: string } | null>(null);
  const [balance, setBalance] = useState<BalanceEstado | null>(null);
  const [balanceAt, setBalanceAt] = useState<Date | null>(null);
  const [balanceCargando, setBalanceCargando] = useState(false);
  const [balanceTick, setBalanceTick] = useState(0);

  const showToast = (msg: string, type: "ok" | "err" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Transiciones ─────────────────────────────────────────
  const irA = useCallback((v: ViewState) => {
    setVista(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // [Denunciar] entra siempre al catálogo: la pestaña ya declara la puerta.
  const irADenunciar = useCallback(() => {
    irA("list");
  }, [irA]);

  // Elegir ficha del catálogo precarga el formulario con su delito y recompensa.
  const elegirObjetivo = useCallback(
    (b: Buscado) => {
      setObjetivoSel(b);
      setReporte((p) => ({
        ...p,
        objetivo: b.alias,
        delitoTipo: b.delitoTipo,
        monto: String(b.recompensaXlm),
      }));
      irA("detail");
    },
    [irA],
  );

  const departamentos = useMemo(
    () => Array.from(new Set(BUSCADOS.map((b) => b.departamento))).sort(),
    [],
  );
  const delitos = useMemo(() => Array.from(new Set(BUSCADOS.map((b) => b.delito))).sort(), []);

  const buscadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return BUSCADOS.filter((b) => {
      if (filtroDepto && b.departamento !== filtroDepto) return false;
      if (filtroDelito && b.delito !== filtroDelito) return false;
      if (!q) return true;
      return (
        b.alias.toLowerCase().includes(q) ||
        b.descripcion.toLowerCase().includes(q) ||
        b.lugarRQ.toLowerCase().includes(q) ||
        b.departamento.toLowerCase().includes(q)
      );
    });
  }, [busqueda, filtroDepto, filtroDelito]);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(apiUrl("/api/cases"), { headers: { "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list: CaseSummary[] = data.casos ?? data.cases ?? [];
      // fallback si mockea: si no es array, normalizar
      setCases(Array.isArray(list) ? list : []);
      if (list.length > 0 && !selectedId) {
        // auto-selecciona el más reciente
        setSelectedId(list[0].caseId);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast("Error cargando casos: " + msg, "err");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(apiUrl(`/api/cases/${id}`), { headers: { "Content-Type": "application/json" } }),
        fetch(apiUrl(`/api/cases/${id}/proof`), { headers: { "Content-Type": "application/json" } }),
      ]);
      if (!r1.ok) {
        const j = await r1.json().catch(() => ({}));
        throw new Error(j.error || `Caso no encontrado (${r1.status})`);
      }
      const d: CaseDetail = await r1.json();
      setDetail(d);
      if (r2.ok) {
        const p: Proof = await r2.json();
        setProof(p);
      } else {
        setProof(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg, "err");
      setDetail(null);
      setProof(null);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  // ── Balance en tiempo real ──────────────────────────────
  // Solo consulta mientras la vista de reporte está montada: es la única
  // La barra está montada en todo el flujo ciudadano, así que sondea
  // durante cualquiera de sus vistas. En el portal de autoridades se corta:
  // allí la billetera del informante no aparece y sería tráfico de sobra.
  const walletBalance = reporte.wallet.trim();
  // Chequeo local de FORMATO únicamente (evita un request inútil). No alcanza
  // para validar el checksum: eso lo hace Horizon con un 400, que el widget
  // maneja aparte. Un string que no pase esta regex ni se consulta a la red.
  const walletValida = PUBLIC_KEY_RE.test(walletBalance);

  useEffect(() => {
    if (vista === "autoridades") return;
    // Una wallet vacía o mal formada da error en Horizon. Mostrar "0.00" en ese
    // caso sería mentir: el saldo todavía no se conoce, así que no se muestra.
    if (!PUBLIC_KEY_RE.test(walletBalance)) {
      setBalance(null);
      setBalanceAt(null);
      setBalanceCargando(false);
      return;
    }

    let cancelado = false;
    const consultar = async () => {
      const valor = await fetchStellarBalance(walletBalance);
      if (cancelado) return;
      setBalance(valor);
      setBalanceAt(new Date());
      setBalanceCargando(false);
    };

    setBalanceCargando(true);
    void consultar();
    const timer = setInterval(consultar, BALANCE_POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
    // balanceTick permite el refresco manual sin duplicar la función de consulta.
  }, [vista, walletBalance, balanceTick]);

  const handleVerify = async (rol: "policia" | "fiscalia") => {
    if (!selectedId) return showToast("Selecciona un caso primero", "err");
    const payload = rol === "policia" ? PNP_PAYLOAD : FISCALIA_PAYLOAD;
    setActionLoading(`verify-${rol}`);
    setReleaseResult(null);
    try {
      const r = await fetchAutorizado(rol, `/api/cases/${selectedId}/verify`, payload);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j.error || `Error ${r.status}`);
      }
      showToast(`${rol === "policia" ? "PNP" : "Fiscalía"} aprobó. Estado: ${statusLabel(j.status ?? "")}`, "ok");
      await fetchCases();
      await fetchDetail(selectedId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ya firmó")) showToast("Este rol ya firmó este caso", "err");
      else showToast(msg, "err");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Inspector: efectos de modal ──────────────────────────
  // Escape cierra · el foco entra al drawer · el scroll del fondo se bloquea.
  useEffect(() => {
    if (!inspect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInspect();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El foco entra al diálogo, no se queda en el botón que lo abrió:
    // si no, el siguiente Tab vuelve a la página de fondo.
    if (inspect === "open") closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [inspect, closeInspect]);

  // Al terminar la salida, el foco regresa al disparador.
  useEffect(() => {
    if (inspect) {
      inspectWasOpen.current = true;
      return;
    }
    if (inspectWasOpen.current) {
      inspectWasOpen.current = false;
      inspectRef.current?.focus();
    }
  }, [inspect]);

  /* Sonda: NO simula nada. Llama al endpoint real de liberación y muestra la
     respuesta real. Es la única forma honesta de enseñar el rechazo — y a la
     vez prueba que la guarda de quorum vive en el servidor, no en el cliente.
     Guarda de seguridad: con el quorum ya alcanzado el endpoint pagaría de
     verdad, así que ahí el botón queda deshabilitado. */
  const quorumAlcanzado = !!detail && detail.firmas.obtenidas >= detail.firmas.requeridas;
  const probeBloqueado = quorumAlcanzado || detail?.status === "PAGADO";

  /* El backend sólo devuelve filas de firma existentes, así que sin este
     cruce la lista mostraría a PNP firmado y omitiría por completo a
     Fiscalía. "1/2" sin nombrar al que falta no sirve de nada. */
  const firmantes = useMemo(() => {
    const d = detail?.firmas.detalle ?? [];
    const firmados = new Map(
      d.filter((f) => f.rol).map((f) => [f.rol as string, f]),
    );
    const base = QUORUM_SIGNERS.map((s) => ({
      rol: s.rol,
      label: s.label,
      ref: s.ref,
      firmado: firmados.get(s.rol)?.firmado ?? false,
    }));
    // Cualquier rol inesperado que venga del backend también se muestra.
    const extras = d
      .filter((f) => f.rol && !QUORUM_SIGNERS.some((s) => s.rol === f.rol))
      .map((f) => ({
        rol: f.rol as string,
        label: f.rol as string,
        ref: f.fecha ?? "—",
        firmado: f.firmado,
      }));
    return [...base, ...extras];
  }, [detail]);

  const handleQuorumProbe = async () => {
    if (!selectedId || !detail || probeBloqueado) return;
    setProbeLoading(true);
    setProbe(null);
    try {
      const r = await fetchAutorizado("policia", `/api/cases/${selectedId}/release`, {
        monto: detail.montoRecompensa,
      });
      const j = await r.json().catch(() => ({}));
      setProbe({
        http: r.status,
        error: r.ok ? null : (j.error as string) ?? `Error ${r.status}`,
      });
    } catch (e: unknown) {
      setProbe({ http: 0, error: e instanceof Error ? e.message : "Fallo de red" });
    } finally {
      setProbeLoading(false);
    }
  };

  const handleRelease = async () => {
    if (!selectedId) return;
    setActionLoading("release");
    setReleaseResult(null);
    // El backend ignora este body y paga caso.montoRecompensaSugerido, así
    // que se envía por contrato pero la cifra real la manda el servidor.
    try {
      const r = await fetchAutorizado("policia", `/api/cases/${selectedId}/release`, {
        monto: detail?.montoRecompensa ?? 50,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      const liberado = j.montoLiberado ?? detail?.montoRecompensa ?? 50;
      setReleaseResult({ explorerUrl: j.explorerUrl, tx: j.tx, montoLiberado: liberado, simulado: !!j.simulado });
      showToast(
        j.simulado
          ? `Pago SIMULADO de ${liberado} XLM (la tx on-chain falló)`
          : `Pago de ${liberado} XLM transferido con éxito`,
        j.simulado ? "err" : "ok",
      );
      await fetchCases();
      await fetchDetail(selectedId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg, "err");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReport = async () => {
    if (!reporte.descripcion.trim()) return showToast("Escribe el detalle de la denuncia", "err");
    setReporteEnviando(true);
    setReporteOk(null);
    setProgreso(8);
    // El objetivo elegido encabeza la descripción para que llegue al expediente.
    const objetivo = reporte.objetivo.trim();
    const descripcion = objetivo
      ? `Objetivo/organización denunciada: ${objetivo}\n\n${reporte.descripcion.trim()}`
      : reporte.descripcion.trim();
    try {
      // Barra de progreso: la API no reporta avance, así que es una
      // estimación visual del anclaje. No pretende medir bytes enviados.
      const avance = setInterval(() => {
        setProgreso((p) => Math.min(p + 14, 92));
      }, 260);

      const r = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          informanteWallet: reporte.wallet,
          delitoTipo: reporte.delitoTipo,
          descripcion,
          montoRecompensaSugerido: Number(reporte.monto) || 50,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      clearInterval(avance);
      setProgreso(100);
      setReporteOk({ caseId: j.caseId, explorerUrl: j.explorerUrl, tx: j.evidenciaAncladaTx });
      setReporte((p) => ({ ...p, descripcion: "" }));
      await fetchCases();
      // La barra termina de lleno antes de saltar a la vista de agradecimiento.
      setTimeout(() => {
        setProgreso(0);
        irA("thanks");
      }, 450);
    } catch (e: unknown) {
      setProgreso(0);
      showToast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setReporteEnviando(false);
    }
  };

  const handleManualLoad = async () => {
    const id = manualId.trim();
    if (!id) return showToast("Pega un caseId válido", "err");
    setSelectedId(id);
    await fetchDetail(id);
    // si no está en lista, añadirlo visualmente
    if (!cases.find((c) => c.caseId === id)) {
      // intentar refrescar lista igual
      fetchCases();
    }
  };

  const handleCreateDemo = async () => {
    try {
      const r = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          informanteWallet: DEMO_INFORMANTE_WALLET,
          delitoTipo: "EXTORSION",
          descripcion: "Reporte demo para pitch — generado desde Portal Autoridades",
          evidenciaHash: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
          montoRecompensaSugerido: 50,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo crear caso demo");
      showToast(`Caso demo creado: ${j.caseId}`, "ok");
      await fetchCases();
      setSelectedId(j.caseId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(msg, "err");
    }
  };

  const canRelease = detail?.status?.toLowerCase() === "listo_para_liberar";
  const montoCaso = detail?.montoRecompensa ?? 50;

  // ══════════════════════════════════════════════════════════
  // VISTA 2 · Catálogo de buscados
  // ══════════════════════════════════════════════════════════
  const VistaList = () => (
    <section className="view active">
      <div className="statusbar">
<span>Catálogo público de requisitoriados</span>
        <span>{BUSCADOS.length} fichas</span>
      </div>

      <div className="list-head">
        <h1 className="hero-title small" style={{ margin: 0 }}>
          Lista de buscados
        </h1>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Buscar por alias, nombre o lugar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar por alias, nombre o lugar"
        />
        <select
          className="select-input"
          value={filtroDepto}
          onChange={(e) => setFiltroDepto(e.target.value)}
          aria-label="Filtrar por departamento"
        >
          <option value="">Departamento</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="select-input"
          value={filtroDelito}
          onChange={(e) => setFiltroDelito(e.target.value)}
          aria-label="Filtrar por tipo de delito"
        >
          <option value="">Tipo de delito</option>
          {delitos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {buscadosFiltrados.length === 0 ? (
        <p className="empty-state">No hay resultados con esos filtros.</p>
      ) : (
        <div className="wanted-grid">
          {buscadosFiltrados.map((b) => (
            <button key={b.id} className="wanted-card" onClick={() => elegirObjetivo(b)}>
              <span className="wanted-name">{b.alias}</span>
              <span className="wanted-desc">{b.descripcion}</span>
              <span className="wanted-reward">
                <b>{formatXlmNumber(b.recompensaXlm)}</b>
                <span>XLM</span>
              </span>
              <span className="wanted-meta">
                {b.delito} · {b.departamento}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  // ══════════════════════════════════════════════════════════
  // VISTA 3 · Ficha de requisitoria
  // ══════════════════════════════════════════════════════════
  const VistaDetail = () => {
    if (!objetivoSel)
      return (
        <section className="view active">
          <p className="empty-state">No hay ninguna ficha seleccionada.</p>
          <button className="btn-ghost sm" onClick={() => irA("list")}>
            <Icon name="arrowLeft" size={13} />
            Volver a la lista
          </button>
        </section>
      );
    const b = objetivoSel;
    return (
      <section className="view active">
        <div className="statusbar">
<span>Ficha de requisitoria</span>
          <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
            <span>{b.esBanda ? "Organización" : "Persona"}</span>
            <button className="btn-ghost sm" onClick={() => irA("list")}>
              <Icon name="arrowLeft" size={13} />
              Volver a la lista
            </button>
          </span>
        </div>

        <div className="panel">
          <div className="detail-head">
            <div>
              <h1 className="detail-name">{b.alias}</h1>
              <p className="panel-sub">{b.descripcion}</p>
            </div>
            <div className="detail-reward">
              <span>Recompensa</span>
              <b>{formatXlmNumber(b.recompensaXlm)} XLM</b>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-row">
              <span>Estado</span>
              <b style={{ color: "var(--red)" }}>Prófugo</b>
            </div>
            <div className="info-row">
              <span>Delito</span>
              <b>{b.delito}</b>
            </div>
            <div className="info-row">
              <span>Lugar de requisitoria</span>
              <b>{b.lugarRQ}</b>
            </div>
            <div className="info-row">
              <span>Departamento</span>
              <b>{b.departamento}</b>
            </div>
          </div>

          <div className="actions">
            <button className="btn-primary" onClick={() => irA("report")}>
              <Icon name="send" size={15} />
              Reportar información
            </button>
            <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>
              La evidencia se ancla en Stellar y la recompensa se libera on-chain
              cuando PNP y Fiscalía aprueban el caso.
            </p>
          </div>
        </div>
      </section>
    );
  };

  // ══════════════════════════════════════════════════════════
  // VISTA 4 · Formulario de denuncia
  // ══════════════════════════════════════════════════════════
  const VistaReport = () => (
    <section className="view active">
        <div className="statusbar">
          <span>Reporte anónimo</span>
          <button className="btn-ghost sm" onClick={() => irA(objetivoSel ? "detail" : "list")}>
          <Icon name="arrowLeft" size={13} />
          Cancelar
        </button>
      </div>

      <div className="report-grid">
        {/* Formulario */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Cuéntanos qué sabes</h2>
              <p className="panel-sub">
                La evidencia se ancla en Stellar automáticamente
              </p>
            </div>
          </div>

          <label className="field">
            <span className="field-label">Objetivo / organización denunciada</span>
            <select
              className="input"
              value={reporte.objetivo}
              onChange={(e) => setReporte({ ...reporte, objetivo: e.target.value })}
            >
              <option value="">Seleccionar objetivo…</option>
              {OBJETIVOS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Tipo de delito</span>
            <select
              className="input"
              value={reporte.delitoTipo}
              onChange={(e) => setReporte({ ...reporte, delitoTipo: e.target.value })}
            >
              <option value="EXTORSION">Extorsión</option>
              <option value="SICARIATO">Sicariato</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Cuéntanos qué sabes</span>
            <textarea
              className="input textarea"
              rows={6}
              placeholder="Dónde lo viste, con quién anda, cómo se moviliza, cualquier dato útil. Tu identidad nunca se comparte."
              value={reporte.descripcion}
              onChange={(e) => setReporte({ ...reporte, descripcion: e.target.value })}
            />
            <div className="char-count">{reporte.descripcion.length} caracteres</div>
          </label>

          {/* Adjuntos: se cuentan, no se suben. El API no tiene endpoint de
              archivos, así que la UI lo dice en vez de fingir un upload. */}
          <div className="section-gap upload-grid">
            <label className="upload-box">
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => setAdjuntos((a) => ({ ...a, imagenes: e.target.files?.length ?? 0 }))}
              />
              <span>Adjuntar imágenes</span>
              <span className="upload-count">
                {adjuntos.imagenes > 0 ? `${adjuntos.imagenes} archivo(s)` : ""}
              </span>
            </label>
            <label className="upload-box">
              <input
                type="file"
                accept="audio/*"
                multiple
                hidden
                onChange={(e) => setAdjuntos((a) => ({ ...a, audio: e.target.files?.length ?? 0 }))}
              />
              <span>Adjuntar audio</span>
              <span className="upload-count">
                {adjuntos.audio > 0 ? `${adjuntos.audio} archivo(s)` : ""}
              </span>
            </label>
          </div>
          <label className="upload-box wide">
            <input
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={(e) => setAdjuntos((a) => ({ ...a, video: e.target.files?.length ?? 0 }))}
            />
            <span>Adjuntar videos</span>
            <span className="upload-count">
              {adjuntos.video > 0 ? `${adjuntos.video} archivo(s)` : ""}
            </span>
          </label>
          <p className="hint" style={{ marginTop: 10 }}>
            Los adjuntos se registran en esta demostración. El envío actual ancla el
            texto de tu testimonio en Stellar, no los archivos.
          </p>

          <div className="field-row" style={{ marginTop: 18 }}>
            <label className="field">
              <span className="field-label">Recompensa (XLM)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={reporte.monto}
                onChange={(e) => setReporte({ ...reporte, monto: e.target.value })}
              />
            </label>
            <label className="field grow">
              <span className="field-label">Wallet del informante (recibirá el pago)</span>
              <input
                className="input"
                value={reporte.wallet}
                onChange={(e) => setReporte({ ...reporte, wallet: e.target.value })}
                spellCheck={false}
              />
            </label>
          </div>

          <button
            className="btn-primary"
            style={{ marginTop: 18 }}
            onClick={handleReport}
            disabled={reporteEnviando}
          >
            {reporteEnviando ? (
              "Anclando evidencia en Stellar…"
            ) : (
              <>
                Enviar denuncia anónima
                <Icon name="send" size={15} />
              </>
            )}
          </button>
          <p className="hint">
            Todo lo que envíes queda cifrado y no se vincula a tu identidad.
          </p>

          <div className={`progress-wrap${reporteEnviando ? " show" : ""}`}>
            <div className="progress-label">
              <span>Subiendo información</span>
              <span>{progreso}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ transform: `scaleX(${progreso / 100})` }}
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );

  // ══════════════════════════════════════════════════════════
  // VISTA 5 · Agradecimiento
  // ══════════════════════════════════════════════════════════
  const VistaThanks = () => (
    <section className="view active">
      <div className="panel narrow center-panel">
        <div className="success-title">Gracias por tu compromiso con el Perú</div>
        <p className="hero-sub" style={{ margin: "0 0 22px" }}>
          Tu reporte fue recibido de forma anónima y ya está en revisión. Si la
          información conduce a una captura, la recompensa se te notifica por el mismo
          canal seguro.
        </p>

        {reporteOk ? (
          <>
            <div className="info-grid" style={{ textAlign: "left" }}>
              <div className="info-row">
                <span>Case ID</span>
                <b className="mono-sm" style={{ color: "var(--teal)", wordBreak: "break-all" }}>
                  {reporteOk.caseId}
                </b>
              </div>
              <div className="info-row">
                <span>Recompensa</span>
                <b className="amount">{reporte.monto} XLM</b>
              </div>
              <div className="info-row">
                <span>Transacción</span>
                <b className="mono-sm" style={{ wordBreak: "break-all" }}>
                  {reporteOk.tx ? `${reporteOk.tx.slice(0, 12)}…` : "—"}
                </b>
              </div>
            </div>
            <a
              className="btn-explorer"
              style={{ marginTop: 16 }}
              href={reporteOk.explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ver evidencia en Stellar Expert
              <Icon name="arrowUpRight" size={13} />
            </a>
          </>
        ) : (
          <p className="hint" style={{ marginBottom: 18 }}>
            No hay un reporte reciente en esta sesión.
          </p>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="btn-primary" onClick={() => irA("list")}>
            Volver a la lista de buscados
            <Icon name="arrowRight" size={15} />
          </button>
        </div>
      </div>
    </section>
  );

  // ══════════════════════════════════════════════════════════
  // VISTA 6 · Portal de autoridades
  // ══════════════════════════════════════════════════════════
  const VistaAutoridades = () => (
    <main className="main-grid">
      {/* Sección 1: Listado */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Casos pendientes</h2>
            <p className="panel-sub">
              {cases.length} caso{cases.length !== 1 ? "s" : ""} en seguimiento
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost sm" onClick={handleCreateDemo}>
              <Icon name="plus" size={13} /> Caso demo
            </button>
            <button className="btn-ghost sm" onClick={fetchCases} disabled={loading}>
              <Icon name="refresh" size={13} />
              {loading ? "Sincronizando" : "Sincronizar"}
            </button>
          </div>
        </div>

        {/* Input manual caseId */}
        <div className="manual-row">
          <input
            className="input"
            aria-label="Case ID a auditar"
            placeholder="Pega un caseId para auditarlo al instante (ej: cm...)"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualLoad()}
          />
          <button className="btn-teal" onClick={handleManualLoad}>
            Auditar
          </button>
        </div>

        {error && (
          <div className="alert-err" role="alert">
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </div>
        )}

        {loading && cases.length === 0 ? (
          <div className="skeleton">Cargando casos…</div>
        ) : cases.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">
              <Icon name="inbox" size={12} /> COLA VACÍA
            </div>
            <div className="empty-title" style={{ marginTop: 14 }}>
              Sin casos aún
            </div>
            <p>
              Crea un caso demo con el botón de arriba o reporta desde el Portal Ciudadano.
              Luego verifícalo aquí.
            </p>
            <button
              className="btn-primary"
              style={{ marginTop: 20, width: "auto" }}
              onClick={handleCreateDemo}
            >
              Crear caso demo
            </button>
          </div>
        ) : (
          <div className="cases-list">
            {cases.map((c) => (
              <button
                key={c.caseId}
                onClick={() => setSelectedId(c.caseId)}
                className={`case-row ${selectedId === c.caseId ? "selected" : ""}`}
              >
                <div className="case-top">
                  <span className="case-id" title={c.caseId}>
                    {c.caseId.slice(0, 8)}…{c.caseId.slice(-4)}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {c.pagoSimulado && (
                      <span className="badge badge-sim" title="El pago NO fue on-chain">
                        Simulado
                      </span>
                    )}
                    <span className={`badge ${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                  </span>
                </div>
                <div className="case-meta">
                  <span>
                    Delito: <b>{c.delitoTipo}</b>
                  </span>
                  <span>
                    Monto: <b className="amount">{c.montoRecompensa} XLM</b>
                  </span>
                </div>
                <div className="case-foot">
                  <span className="mono-sm">{new Date(c.createdAt).toLocaleString("es-PE")}</span>
                  <span className="mono-sm" style={{ color: "var(--teal)", fontSize: 11 }}>
                    {c.caseId}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="hint">
          Selecciona un caso de la lista para auditarlo, o pega su identificador en el
          campo de búsqueda.
        </div>
      </section>

      {/* Sección 2: Detalle + Acciones */}
      <section className="panel detail-panel">
        {!selectedId ? (
          <div className="empty" style={{ padding: "72px 24px" }}>
            <div className="empty-mark">
              <Icon name="building" size={12} /> AUDITORÍA
            </div>
            <p>Selecciona un caso de la lista para auditarlo.</p>
          </div>
        ) : !detail ? (
          <div className="skeleton">Cargando detalle de {selectedId.slice(0, 12)}…</div>
        ) : (
          <>
            <div
              className="panel-head"
              style={{
                borderBottom: "1px solid var(--line)",
                paddingBottom: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <h2 className="panel-title">Auditoría del caso</h2>
                <p className="mono-sm" style={{ wordBreak: "break-all" }}>
                  {detail.caseId}
                </p>
              </div>
              <span className={`badge lg ${statusTone(detail.status)}`}>
                {statusLabel(detail.status)}
              </span>
            </div>

            <div className="info-grid">
              <div className="info-row">
                <span>Delito</span>
                <b>{detail.delitoTipo}</b>
              </div>
              <div className="info-row">
                <span>Estado</span>
                <b style={{ color: statusColor(detail.status) }}>{statusLabel(detail.status)}</b>
              </div>
              <div className="info-row">
                <span>Recompensa</span>
                <b style={{ color: "var(--teal)" }}>{formatXlmNumber(montoCaso)} XLM</b>
              </div>
              <div className="info-row">
                <span>Firmas</span>
                <b>
                  {detail.firmas.obtenidas} / {detail.firmas.requeridas}
                </b>
              </div>
              <div className="info-row">
                <span>Creado</span>
                <span className="mono-sm">{new Date(detail.createdAt).toLocaleString("es-PE")}</span>
              </div>
            </div>

            {/* Firmas detalle */}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {detail.firmas.detalle.map((f, i) => (
                <span key={i} className={`chip ${f.firmado ? "is-signed" : ""}`}>
                  {f.firmado && <Icon name="check" size={12} />}
                  {f.rol ?? "—"}:{" "}
                  {f.resultado ? f.resultado.toUpperCase() : f.firmado ? "firmado" : "pendiente"}
                </span>
              ))}
              {detail.firmas.detalle.length === 0 && (
                <span className="chip muted">Sin firmas aún — requiere PNP + Fiscalía</span>
              )}
            </div>

            {/* Stellar Evidence */}
            <div className="stellar-box">
              <div className="stellar-title">
                <Icon name="link" size={13} />
                Evidencia en Stellar (testnet)
              </div>
              {proof?.explorerLinks.evidencia || detail.evidenciaAncladaTx ? (
                <a
                  href={
                    proof?.explorerLinks.evidencia ??
                    `https://stellar.expert/explorer/testnet/tx/${detail.evidenciaAncladaTx}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="link-explorer"
                >
                  Ver en Stellar Expert
                  <Icon name="arrowUpRight" size={13} />
                </a>
              ) : (
                <span className="muted-sm">Aún sin ancla — se genera al crear el caso</span>
              )}
              {detail.evidenciaAncladaTx && (
                <div
                  className="mono-sm"
                  style={{ wordBreak: "break-all", marginTop: 6, opacity: 0.85 }}
                >
                  tx: {detail.evidenciaAncladaTx}
                </div>
              )}
              {proof?.evidenciaHash && (
                <div
                  className="mono-sm"
                  style={{ wordBreak: "break-all", opacity: 0.7 }}
                >
                  hash: {proof.evidenciaHash.slice(0, 48)}…
                </div>
              )}
            </div>

            {/* Un pago simulado NUNCA debe leerse como un pago real on-chain */}
            {detail.pagoSimulado && (
              <div className="sim-warning" role="alert">
                <b>Pago simulado</b> — este hash <b>no existe on-chain</b>. La transacción
                real falló y no se transfirió XLM al informante.
              </div>
            )}

            {/* Acciones inmediatas */}
            <div className="actions">
              <h3 className="actions-title">Acciones inmediatas</h3>
              <div className="btn-grid">
                <button
                  className="btn-verify pnp"
                  disabled={!!actionLoading}
                  onClick={() => handleVerify("policia")}
                >
                  <span className="btn-label">
                    <Icon name="badge" size={13} />
                    {actionLoading === "verify-policia" ? "Firmando…" : "Aprobar PNP"}
                  </span>
                  <span className="btn-sub">PNP-DIRNIC-04821 · Policía</span>
                </button>
                <button
                  className="btn-verify fiscalia"
                  disabled={!!actionLoading}
                  onClick={() => handleVerify("fiscalia")}
                >
                  <span className="btn-label">
                    <Icon name="badge" size={13} />
                    {actionLoading === "verify-fiscalia" ? "Firmando…" : "Aprobar Fiscalía"}
                  </span>
                  <span className="btn-sub">MP-FISC-99120 · Fiscalía</span>
                </button>
              </div>

              <button
                className="btn-release"
                disabled={!canRelease || !!actionLoading}
                onClick={handleRelease}
                title={
                  !canRelease
                    ? "Requiere las dos firmas de aprobación"
                    : `Liberar ${formatXlmNumber(montoCaso)} XLM on-chain`
                }
              >
                <Icon name="unlock" size={13} />
                {actionLoading === "release"
                  ? "Liberando…"
                  : `Liberar recompensa on-chain (${formatXlmNumber(montoCaso)} XLM)`}
              </button>
              {!canRelease && (
                <p className="muted-sm" style={{ textAlign: "center", marginTop: 6 }}>
                  Solo habilitado cuando el caso tenga las dos firmas de aprobación.
                </p>
              )}

              <button
                ref={inspectRef}
                className="btn-inspect"
                onClick={openInspect}
                aria-haspopup="dialog"
                aria-expanded={inspectOpen}
              >
                <span className="btn-inspect-mark" aria-hidden="true">⌕</span>
                Inspeccionar regla de consenso on-chain
              </button>
            </div>

            {/* Resultado pago */}
            {releaseResult && (
              <div className={releaseResult.simulado ? "pay-success is-simulado" : "pay-success"}>
                <div className="pay-icon">
                  <Icon name={releaseResult.simulado ? "alert" : "check"} size={20} />
                </div>
                <div className="pay-title">
                  {releaseResult.simulado
                    ? `Pago simulado — la tx on-chain falló (${formatXlmNumber(releaseResult.montoLiberado)} XLM)`
                    : `Pago de ${formatXlmNumber(releaseResult.montoLiberado)} XLM transferido con éxito`}
                </div>
                <div className="mono-sm" style={{ wordBreak: "break-all", marginTop: 8 }}>
                  tx: {releaseResult.tx}
                </div>
                <a
                  href={releaseResult.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-explorer"
                >
                  Ver en Stellar Expert
                  <Icon name="arrowUpRight" size={13} />
                </a>
              </div>
            )}
            {detail.releaseTx && !releaseResult && (
              <div className="pay-success">
                <div className="pay-icon">
                  <Icon name="check" size={20} />
                </div>
                <div className="pay-title">Caso ya pagado</div>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${detail.releaseTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-explorer"
                >
                  Ver pago en Stellar Expert
                  <Icon name="arrowUpRight" size={13} />
                </a>
              </div>
            )}

            {/* Raw JSON colapsable */}
            <details style={{ marginTop: 18 }}>
              <summary>
                <Icon name="chevronRight" size={13} />
                JSON
              </summary>
              <pre className="json-pre">{JSON.stringify({ detail, proof, releaseResult }, null, 2)}</pre>
            </details>
          </>
        )}
      </section>
    </main>
  );

  /* Barra de estado de la billetera. Va montada una sola vez, por encima
     del flujo ciudadano, para que el saldo y el enlace a Testnet estén a la
     vista en las cuatro vistas sin repetirlos en cada una.

     Es una barra y no un panel porque en una demostración la pregunta
     "¿cuánto tengo en la cuenta que va a recibir la recompensa?" no puede
     depender de en qué pantalla esté el usuario. */
  const WalletBar = () => {
    const estado = balance?.estado;
    const falla = estado === "invalida" || estado === "inexistente" || estado === "error";
    return (
      <div className="wallet-bar" role="status" aria-live="off">
        <div className="wallet-bar-id">
          <span className="wallet-bar-label">
            <Icon name="wallet" size={13} />
            Billetera receptora
          </span>
          {walletValida ? (
            <span className="mono-sm wallet-bar-addr" title={walletBalance}>
              {walletBalance.slice(0, 6)}…{walletBalance.slice(-4)}
            </span>
          ) : (
            <span className="wallet-bar-addr-empty">Sin public key válida</span>
          )}
        </div>

        <div className="wallet-bar-amount">
          <span
            className={`balance-value wallet-bar-value${falla ? " is-warn" : ""}`}
            data-loading={balanceCargando || undefined}
          >
            {/* "…" es "todavía consultando", no "no sé": en cuanto Horizon
                responde —bien o mal— el saldo se resuelve a cifra o a "—". */}
            {balance?.estado === "ok"
              ? balance.balance
              : falla || !walletValida
                ? "—"
                : "…"}
          </span>
          <span className="balance-unit">XLM</span>
        </div>

        <div className="wallet-bar-net">
          <span className={`net-chip${falla ? " is-warn" : ""}`}>
            <span className="net-dot" />
            Stellar Testnet
          </span>
          {balanceAt && !falla && (
            <span className="mono-sm wallet-bar-time">
              {balanceAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        <div className="wallet-bar-actions">
          <button
            className="btn-ghost sm"
            onClick={() => setBalanceTick((t) => t + 1)}
            disabled={!walletValida || balanceCargando}
            title="Consultar Horizon ahora"
            aria-label="Actualizar saldo"
          >
            <Icon name="refresh" size={13} />
          </button>
          <a
            className="btn-ghost sm"
            href={`https://stellar.expert/explorer/testnet/account/${walletBalance}`}
            target="_blank"
            rel="noreferrer"
            title="Ver cuenta en Stellar Expert"
            aria-label="Ver cuenta en Stellar Expert"
          >
            <Icon name="arrowUpRight" size={13} />
          </a>
        </div>

        {falla && (
          <p className="wallet-bar-warn">
            {estado === "invalida" &&
              "Public key no válida: el checksum de Stellar no coincide. La recompensa no podrá enviarse a esta dirección."}
            {estado === "inexistente" &&
              "La public key es válida, pero la cuenta no existe todavía en Stellar Testnet. Fúndela con friendbot antes de cobrar."}
            {estado === "error" &&
              "No pudimos consultar Horizon. El saldo es desconocido, no cero."}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="escudo-root">
      {/* Barra de navegación global */}
      <div className="topstack">
        <header className="topbar">
        <div className="brand">
          <span className="brand-name">EscudoPay</span>
          <span className="brand-sub">ADMIN</span>
        </div>
        <nav className="tabs" aria-label="Vistas del portal">
          <button
            className={vista === "autoridades" ? "tab" : "tab active"}
            onClick={irADenunciar}
            aria-pressed={vista !== "autoridades"}
          >
            <Icon name="smartphone" />
            Denunciar
          </button>
          <button
            className={vista === "autoridades" ? "tab active" : "tab"}
            onClick={() => irA("autoridades")}
            aria-pressed={vista === "autoridades"}
          >
            <Icon name="badge" />
            Verificación Autoridades
          </button>
        </nav>
        <div className="header-actions">
          <span className="live-dot">
            <span className="dot" />
            CANAL SEGURO
          </span>
          {vista === "autoridades" && (
            <button className="btn-ghost sm" onClick={fetchCases} disabled={loading}>
              <Icon name="refresh" size={13} />
              {loading ? "Sincronizando" : "Refrescar"}
            </button>
          )}
        </div>
      </header>

        {/* Barra de billetera: presente en todo el flujo ciudadano, ausente
            en el portal de autoridades. */}
        {vista !== "autoridades" && <WalletBar />}
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <Icon name={toast.type === "ok" ? "check" : toast.type === "err" ? "alert" : "badge"} size={15} />
          <span>{toast.msg}</span>
        </div>
      )}

      {vista === "autoridades" ? (
        VistaAutoridades()
      ) : (
        <main className="citizen-wrap" style={{ gridTemplateColumns: "1fr" }}>
          {vista === "list" && VistaList()}
          {vista === "detail" && VistaDetail()}
          {vista === "report" && VistaReport()}
          {vista === "thanks" && VistaThanks()}
        </main>
      )}

      <footer className="footer">
        <span>EscudoPay · Portal de Autoridades</span>
      </footer>

      {inspect && detail && (
        <div
          className={`drawer-layer ${inspect === "open" ? "is-open" : "is-closing"}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeInspect();
          }}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <header className="drawer-head">
              <div>
                <h2 className="drawer-title" id="drawer-title">
                  Garantía de Custodia Criptográfica
                  <span className="drawer-title-sub">Stellar Escrow · multisig 2-de-2</span>
                </h2>
              </div>
              <button ref={closeRef} className="drawer-close" onClick={closeInspect} aria-label="Cerrar inspección">
                <Icon name="close" size={15} />
              </button>
            </header>

            <div className="drawer-body">
              {/* Quorum en vivo: se lee de `detail.firmas`, que se refresca
                  tras cada firma, así que refleja el estado real. */}
              <div
                className={`quorum-pill ${quorumAlcanzado ? "is-ok" : "is-blocked"}`}
                role="status"
                aria-live="polite"
              >
                <span className="quorum-dot" aria-hidden="true" />
                {quorumAlcanzado
                  ? `ESTADO: AUTORIZADO (${detail.firmas.obtenidas}/${detail.firmas.requeridas} firmas)`
                  : `ESTADO: BLOQUEADO (${detail.firmas.obtenidas}/${detail.firmas.requeridas} firmas)`}
              </div>

              {!quorumAlcanzado && (
                <p className="drawer-note">
                  La red Stellar rechaza automáticamente cualquier intento de
                  liberación sin el consenso conjunto de PNP y Ministerio Público.
                </p>
              )}

              {/* Quién falta, nombrado. "1/2" no dice quién. */}
              <ul className="quorum-signers">
                {firmantes.map((s) => (
                  <li key={s.rol} className={s.firmado ? "is-ok" : "is-pending"}>
                    <span className="quorum-signer-role">
                      {s.label}
                      <span className="quorum-signer-ref">{s.ref}</span>
                    </span>
                    <span className="quorum-signer-state">
                      {s.firmado ? "FIRMADO" : "PENDIENTE"}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="drawer-section">
                <h3 className="drawer-section-title">Verificación antes del build</h3>
                <CodeView code={QUORUM_CODE} />
              </div>

              <div className="drawer-section">
                <h3 className="drawer-section-title">Intento de retiro con firma incompleta</h3>
                <p className="drawer-note">
                  Envía una solicitud real de liberación a <code>/api/cases/{selectedId}/release</code>.
                  El backend decide; la interfaz sólo muestra lo que responde.
                </p>
                <button
                  className="btn-probe"
                  onClick={handleQuorumProbe}
                  disabled={probeLoading || probeBloqueado}
                >
                  {probeLoading
                    ? "Enviando intento…"
                    : `Probar intento de retiro con ${detail.firmas.obtenidas || 1} firma${detail.firmas.obtenidas === 1 ? "" : "s"}`}
                </button>
                {probeBloqueado && (
                  <p className="drawer-note">
                    Con el quorum alcanzado esta prueba pagaría la recompensa de
                    verdad. Para verla, abre un caso con una sola firma.
                  </p>
                )}
                {probe && (
                  <div className={`probe-out ${probe.error ? "is-denied" : "is-ok"}`}>
                    <div className="probe-status">
                      <span className="probe-code">
                        {probe.http === 0 ? "RED" : `HTTP ${probe.http}`}
                      </span>
                      <span>{probe.error ? "Rechazado por el backend" : "Aceptado"}</span>
                    </div>
                    <p className="probe-message">
                      {probe.error ?? "El backend liberó el pago."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
