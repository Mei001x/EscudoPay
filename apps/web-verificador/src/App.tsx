import { useEffect, useState, useCallback } from "react";

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

const formatXlm = (raw: string) =>
  parseFloat(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
  shield: "M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z",
  smartphone: "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  refresh: "M20 11a8 8 0 10-1.5 5.5M20 6v5h-5",
  check: "M4 12.5l5 5L20 6.5",
  alert: "M12 8.5v5M12 17h.01M10.3 4.2L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z",
  arrowUpRight: "M8 16L16 8M9 8h7v7",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  chevronRight: "M9 5l7 7-7 7",
  link: "M10.5 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L12 6.3M13.5 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5",
  wallet: "M3 8a2 2 0 012-2h12a2 2 0 012 2M3 8v9a2 2 0 002 2h14a2 2 0 002-2v-3M3 8h14a2 2 0 012 2v3h-5a2 2 0 010-4h5M17 9.5h.01",
  key: "M15.5 8.5a4 4 0 11-3.2 6.4L4 23.2V20h3v-3h3v-2.5h2.3l3-3a4 4 0 011.2-3z",
  inbox: "M3 13h5l1.5 3h5L16 13h5M4.5 5.5h15l1.5 7.5v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4l1.5-7.5z",
  satellite: "M12 20a8 8 0 018-8M12 20a8 8 0 01-8-8M12 20a8 8 0 008-8M8.5 15.5L5 12l3.5-3.5L12 12l-3.5 3.5zM12 12l3.5-3.5L19 12l-3.5 3.5L12 12zM9 19h6",
  send: "M21 3L10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3z",
  building: "M4 21V6a2 2 0 012-2h6a2 2 0 012 2v15M14 10h4a2 2 0 012 2v9M4 21h17M7.5 8h3M7.5 12h3M7.5 16h3",
  badge: "M12 3l2.5 1.8 3-.2.5 3 2.5 1.7-1.5 2.6 1.5 2.6-2.5 1.7-.5 3-3-.2L12 21l-2.5-1.8-3 .2-.5-3L3.5 15l1.5-2.6L3.5 8l2.5-1.7.5-3 3 .2L12 3zM9.5 12l1.8 1.8L15 10",
  unlock: "M7 11V7a5 5 0 019.5-2M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1zM12 15v2",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  plus: "M12 5v14M5 12h14",
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

export default function App() {
  const [activeTab, setActiveTab] = useState<"autoridades" | "ciudadano">("autoridades");
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
  // ── Formulario de denuncia (ciudadano) ──
  const [reporte, setReporte] = useState({
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
  // Solo consulta mientras la vista ciudadana está montada: en el panel de
  // autoridades el balance no aporta nada y cada poll sería traffic waste.
  const walletBalance = reporte.wallet.trim();
  // Chequeo local de FORMATO únicamente (evita un request inútil). No alcanza
  // para validar el checksum: eso lo hace Horizon con un 400, que el widget
  // maneja aparte. Un string que no pase esta regex ni se consulta a la red.
  const walletValida = PUBLIC_KEY_RE.test(walletBalance);

  useEffect(() => {
    if (activeTab !== "ciudadano") return;
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
  }, [activeTab, walletBalance, balanceTick]);

  const handleVerify = async (rol: "policia" | "fiscalia") => {
    if (!selectedId) return showToast("Selecciona un caso primero", "err");
    const payload = rol === "policia" ? PNP_PAYLOAD : FISCALIA_PAYLOAD;
    setActionLoading(`verify-${rol}`);
    setReleaseResult(null);
    try {
      const r = await fetch(apiUrl(`/api/cases/${selectedId}/verify`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  const handleRelease = async () => {
    if (!selectedId) return;
    setActionLoading("release");
    setReleaseResult(null);
    try {
      const r = await fetch(apiUrl(`/api/cases/${selectedId}/release`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: 50 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setReleaseResult({ explorerUrl: j.explorerUrl, tx: j.tx, montoLiberado: j.montoLiberado ?? 50, simulado: !!j.simulado });
      showToast(
        j.simulado ? "Pago SIMULADO (la tx on-chain falló)" : "Pago de 50 XLM transferido con éxito",
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
    try {
      const r = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          informanteWallet: reporte.wallet,
          delitoTipo: reporte.delitoTipo,
          descripcion: reporte.descripcion,
          montoRecompensaSugerido: Number(reporte.monto) || 50,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setReporteOk({ caseId: j.caseId, explorerUrl: j.explorerUrl, tx: j.evidenciaAncladaTx });
      showToast(`Denuncia registrada: ${j.caseId}`, "ok");
      setReporte((p) => ({ ...p, descripcion: "" }));
      await fetchCases();
    } catch (e: unknown) {
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

  return (
    <div className="escudo-root">
      {/* Header Tabs */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-shield">
            <Icon name="shield" size={15} />
          </span>
          <span className="brand-name">EscudoPay</span>
          <span className="brand-sub">ADMIN</span>
        </div>
        <nav className="tabs" aria-label="Vistas del portal">
          <button
            className={activeTab === "ciudadano" ? "tab active" : "tab"}
            onClick={() => setActiveTab("ciudadano")}
            aria-pressed={activeTab === "ciudadano"}
          >
            <Icon name="smartphone" />
            Denunciar
          </button>
          <button
            className={activeTab === "autoridades" ? "tab active" : "tab"}
            onClick={() => setActiveTab("autoridades")}
            aria-pressed={activeTab === "autoridades"}
          >
            <Icon name="shield" />
            Verificación Autoridades
          </button>
        </nav>
        <div className="header-actions">
          <span className="live-dot">
            <span className="dot" />
            CANAL SEGURO
          </span>
          <button className="btn-ghost sm" onClick={fetchCases} disabled={loading}>
            <Icon name="refresh" />
            {loading ? "Sincronizando" : "Refrescar"}
          </button>
        </div>
      </header>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <Icon name={toast.type === "ok" ? "check" : toast.type === "err" ? "alert" : "badge"} />
          <span>{toast.msg}</span>
        </div>
      )}

      {activeTab === "ciudadano" ? (
        <main className="citizen-wrap">
          <section className="panel balance-panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">
                  <Icon name="wallet" />
                  Balance en Stellar · tiempo real
                </h2>
                <p className="panel-sub">
                  GET <code>{HORIZON_TESTNET}/accounts/{"{wallet}"}</code> · se actualiza cada{" "}
                  {BALANCE_POLL_MS / 1000}s
                </p>
              </div>
              <button
                className="btn-ghost sm"
                onClick={() => setBalanceTick((t) => t + 1)}
                disabled={!walletValida || balanceCargando}
                title="Consultar Horizon ahora"
              >
                <Icon name="refresh" />
                {balanceCargando ? "Consultando" : "Actualizar"}
              </button>
            </div>

            {walletValida ? (
              <div className="balance-body">
                {balance?.estado === "invalida" ? (
                  <>
                    <div className="balance-amount">
                      <span className="balance-value is-warn">—</span>
                      <span className="balance-unit">XLM</span>
                    </div>
                    <div className="balance-warn">
                      <Icon name="alert" size={13} /> Esta <b>public key no es válida</b>: el checksum de Stellar no coincide. No es una
                      wallet de Testnet y la recompensa <b>no podrá enviarse</b> a esta dirección. Copia la clave
                      pública (empieza con G, 56 caracteres) desde tu wallet.
                    </div>
                  </>
                ) : balance?.estado === "inexistente" ? (
                  <>
                    <div className="balance-amount">
                      <span className="balance-value is-warn">—</span>
                      <span className="balance-unit">XLM</span>
                    </div>
                    <div className="balance-warn">
                      <Icon name="alert" size={13} /> La public key es válida, pero esta cuenta <b>no existe todavía en Stellar Testnet</b>.
                      Fúndela con friendbot o actívala con un pago mínimo antes de cobrar.
                    </div>
                  </>
                ) : balance?.estado === "error" ? (
                  <>
                    <div className="balance-amount">
                      <span className="balance-value is-warn">—</span>
                      <span className="balance-unit">XLM</span>
                    </div>
                    <div className="balance-warn">
                      <Icon name="alert" size={13} /> No pudimos consultar Horizon. El saldo es <b>desconocido</b>, no cero. Reintenta en unos
                      segundos.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="balance-amount">
                      <span className="balance-value" data-loading={balanceCargando || undefined}>
                        {balance?.estado === "ok" ? balance.balance : "…"}
                      </span>
                      <span className="balance-unit">XLM</span>
                    </div>
                    <p className="hint" style={{ textAlign: "left", marginTop: 10 }}>
                      Es la cuenta que recibirá tu recompensa. El saldo se lee directo de la red Stellar, no de
                      nuestros servidores.
                    </p>
                  </>
                )}
                <div className="balance-meta">
                  <span className="mono-sm balance-addr" title={walletBalance}>
                    {walletBalance.slice(0, 8)}…{walletBalance.slice(-6)}
                  </span>
                  {balanceAt && (
                    <span className="mono-sm" title={balanceAt.toLocaleString("es-PE")}>
                      · actualizado {balanceAt.toLocaleTimeString("es-PE")}
                    </span>
                  )}
                </div>
                <a
                  className="btn-explorer"
                  style={{ marginTop: 10 }}
                  href={`https://stellar.expert/explorer/testnet/account/${walletBalance}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver cuenta en Stellar Expert
                  <Icon name="arrowUpRight" />
                </a>
              </div>
            ) : (
              <div className="empty" style={{ padding: "18px" }}>
                <div className="empty-mark">
                  <Icon name="key" size={12} /> PUBLIC KEY
                </div>
                <p>
                  Ingresa una public key con formato válido (empieza con <code>G</code>, 56 caracteres) para
                  consultar su balance contra Stellar Testnet.
                </p>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">
                <Icon name="smartphone" />
                Reportar información (anónimo)
              </h2>
                <p className="panel-sub">POST <code>/api/reports</code> · La evidencia se ancla en Stellar automáticamente</p>
              </div>
            </div>

            <label className="field">
              <span className="field-label">Tipo de delito</span>
              <select className="input" value={reporte.delitoTipo} onChange={(e) => setReporte({ ...reporte, delitoTipo: e.target.value })}>
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
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Recompensa sugerida (XLM)</span>
                <input className="input" type="number" min={1} value={reporte.monto} onChange={(e) => setReporte({ ...reporte, monto: e.target.value })} />
              </label>
              <label className="field grow">
                <span className="field-label">Wallet del informante (recibirá el pago)</span>
                <input className="input" value={reporte.wallet} onChange={(e) => setReporte({ ...reporte, wallet: e.target.value })} spellCheck={false} />
              </label>
            </div>

            <button className="btn-primary" style={{ marginTop: 18 }} onClick={handleReport} disabled={reporteEnviando}>
              {reporteEnviando ? (
                "Anclando evidencia en Stellar…"
              ) : (
                <>
                  Enviar denuncia anónima
                  <Icon name="send" size={15} />
                </>
              )}
            </button>
            <p className="hint">Todo lo que envíes queda cifrado y no se vincula a tu identidad.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Resultado</h2>
            </div>
            {!reporteOk ? (
              <div className="empty">
                <div className="empty-mark">
                  <Icon name="satellite" size={12} /> SIN DENUNCIAS
                </div>
                <p>
                  Aún no has enviado ninguna denuncia. Cuando la envíes verás aquí el <b>caseId</b> y el enlace
                  a la evidencia anclada en Stellar Expert.
                </p>
              </div>
            ) : (
              <div className="pay-success">
                <div className="pay-icon">
                  <Icon name="check" />
                </div>
                <div className="pay-title">Denuncia registrada</div>
                <p className="pay-body">Tu denuncia quedó registrada y la evidencia está anclada on-chain.</p>
                <div className="mono-sm" style={{ marginTop: 12, wordBreak: "break-all" }}>
                  caseId: <b style={{ color: "var(--teal)" }}>{reporteOk.caseId}</b>
                </div>
                <a href={reporteOk.explorerUrl} target="_blank" rel="noreferrer" className="btn-explorer">
                  Ver evidencia en Stellar Expert
                  <Icon name="arrowUpRight" />
                </a>
                <div style={{ marginTop: 14 }}>
                  <button className="btn-ghost sm" onClick={() => setActiveTab("autoridades")}>
                    Ir a Verificación Autoridades
                    <Icon name="arrowRight" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="main-grid">
          {/* Sección 1: Listado */}
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">Casos pendientes</h2>
                <p className="panel-sub">GET <code>/api/cases</code> · {cases.length} caso{cases.length !== 1 ? "s" : ""} · Backend <code>{apiUrl("/api/cases")}</code></p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost sm" onClick={handleCreateDemo}>
                  <Icon name="plus" size={13} /> Caso demo
                </button>
                <button className="btn-ghost sm" onClick={fetchCases} disabled={loading}>
                  <Icon name="refresh" size={13} /> Sincronizar
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
              <button className="btn-teal" onClick={handleManualLoad}>Auditar</button>
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
                <div className="empty-title" style={{ marginTop: 14 }}>Sin casos aún</div>
                <p>
                  Crea un caso demo con el botón de arriba o reporta desde el Portal Ciudadano. Luego verifícalo aquí.
                </p>
                <button className="btn-primary" style={{ marginTop: 20, width: "auto" }} onClick={handleCreateDemo}>
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
                      <span className="case-id" title={c.caseId}>{c.caseId.slice(0, 8)}…{c.caseId.slice(-4)}</span>
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
                      <span>Delito: <b>{c.delitoTipo}</b></span>
                      <span>Monto: <b>{c.montoRecompensa} XLM</b></span>
                    </div>
                    <div className="case-foot">
                      <span className="mono-sm">{new Date(c.createdAt).toLocaleString("es-PE")}</span>
                      <span className="mono-sm" style={{ color: "var(--teal)", fontSize: 11 }}>{c.caseId}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="hint">Tip pitch: deja un <code>caseId</code> listo en el input manual y pégalo en vivo.</div>
          </section>

          {/* Sección 2: Detalle + Acciones */}
          <section className="panel detail-panel">
            {!selectedId ? (
              <div className="empty" style={{ padding: "72px 24px" }}>
                <div className="empty-mark">
                  <Icon name="building" size={12} /> AUDITORÍA
                </div>
                <p>
                  Selecciona un caso de la lista o pega un <code>caseId</code> para auditar.
                </p>
              </div>
            ) : !detail ? (
              <div className="skeleton">Cargando detalle de {selectedId.slice(0, 12)}…</div>
            ) : (
              <>
                <div className="panel-head" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 14, marginBottom: 16 }}>
                  <div>
                    <h2 className="panel-title">Auditoría del caso</h2>
                    <p className="mono-sm" style={{ wordBreak: "break-all" }}>{detail.caseId}</p>
                  </div>
                  <span className={`badge lg ${statusTone(detail.status)}`}>{statusLabel(detail.status)}</span>
                </div>

                <div className="info-grid">
                  <div className="info-row"><span>Delito</span><b>{detail.delitoTipo}</b></div>
                  <div className="info-row"><span>Estado</span><b style={{ color: statusColor(detail.status) }}>{statusLabel(detail.status)}</b></div>
                  <div className="info-row"><span>Recompensa</span><b>{detail.montoRecompensa} XLM</b></div>
                  <div className="info-row"><span>Firmas</span><b>{detail.firmas.obtenidas} / {detail.firmas.requeridas}</b></div>
                  <div className="info-row"><span>Creado</span><span className="mono-sm">{new Date(detail.createdAt).toLocaleString("es-PE")}</span></div>
                </div>

                {/* Firmas detalle */}
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detail.firmas.detalle.map((f, i) => (
                    <span key={i} className={`chip ${f.firmado ? "is-signed" : ""}`}>
                      {f.firmado && <Icon name="check" />}
                      {f.rol ?? "—"}:{" "}
                      {f.resultado ? f.resultado.toUpperCase() : f.firmado ? "firmado" : "pendiente"}
                    </span>
                  ))}
                  {detail.firmas.detalle.length === 0 && <span className="chip muted">Sin firmas aún — requiere PNP + Fiscalía</span>}
                </div>

                {/* Stellar Evidence */}
                <div className="stellar-box">
                  <div className="stellar-title">
                    <Icon name="link" />
                    Evidencia en Stellar (testnet)
                  </div>
                  {proof?.explorerLinks.evidencia || detail.evidenciaAncladaTx ? (
                    <a
                      href={proof?.explorerLinks.evidencia ?? `https://stellar.expert/explorer/testnet/tx/${detail.evidenciaAncladaTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link-explorer"
                    >
                      Ver en Stellar Expert
                      <Icon name="arrowUpRight" />
                    </a>
                  ) : (
                    <span className="muted-sm">Aún sin ancla — se genera al crear el caso</span>
                  )}
                  {detail.evidenciaAncladaTx && (
                    <div className="mono-sm" style={{ wordBreak: "break-all", marginTop: 6, opacity: 0.85 }}>
                      tx: {detail.evidenciaAncladaTx}
                    </div>
                  )}
                  {proof?.evidenciaHash && (
                    <div className="mono-sm" style={{ wordBreak: "break-all", opacity: 0.7 }}>hash: {proof.evidenciaHash.slice(0, 48)}…</div>
                  )}
                </div>

                {/* Un pago simulado NUNCA debe leerse como un pago real on-chain */}
                {detail.pagoSimulado && (
                  <div className="sim-warning" role="alert">
                    <b>Pago simulado</b> — este hash <b>no existe on-chain</b>. La transacción real falló y no
                    se transfirió XLM al informante.
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
                        <Icon name="badge" />
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
                        <Icon name="badge" />
                        {actionLoading === "verify-fiscalia" ? "Firmando…" : "Aprobar Fiscalía"}
                      </span>
                      <span className="btn-sub">MP-FISC-99120 · Fiscalía</span>
                    </button>
                  </div>

                  <button
                    className="btn-release"
                    disabled={!canRelease || !!actionLoading}
                    onClick={handleRelease}
                    title={!canRelease ? "Requiere estado LISTO_PARA_LIBERAR (2 firmas APROBADO)" : "Liberar 50 XLM on-chain"}
                  >
                    <Icon name="unlock" />
                    {actionLoading === "release" ? "Liberando…" : "Liberar recompensa on-chain (50 XLM)"}
                  </button>
                  {!canRelease && (
                    <p className="muted-sm" style={{ textAlign: "center", marginTop: 6 }}>
                      Solo habilitado cuando el estado pase a <code>listo_para_liberar</code> (tras 2 aprobaciones)
                    </p>
                  )}
                </div>

                {/* Resultado pago */}
                {releaseResult && (
                  <div className={releaseResult.simulado ? "pay-success is-simulado" : "pay-success"}>
                    <div className="pay-icon">
                      <Icon name={releaseResult.simulado ? "alert" : "check"} />
                    </div>
                    <div className="pay-title">
                      {releaseResult.simulado
                        ? "Pago simulado — la tx on-chain falló"
                        : "Pago de 50 XLM transferido con éxito"}
                    </div>
                    <div className="mono-sm" style={{ wordBreak: "break-all", marginTop: 8 }}>tx: {releaseResult.tx}</div>
                    <a href={releaseResult.explorerUrl} target="_blank" rel="noreferrer" className="btn-explorer">
                      Ver en Stellar Expert
                      <Icon name="arrowUpRight" />
                    </a>
                  </div>
                )}
                {detail.releaseTx && !releaseResult && (
                  <div className="pay-success">
                    <div className="pay-icon">
                      <Icon name="check" />
                    </div>
                    <div className="pay-title">Caso ya pagado</div>
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${detail.releaseTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-explorer"
                    >
                      Ver pago en Stellar Expert
                      <Icon name="arrowUpRight" />
                    </a>
                  </div>
                )}

                {/* Raw JSON colapsable */}
                <details style={{ marginTop: 18 }}>
                  <summary>
                    <Icon name="chevronRight" />
                    Ver JSON crudo (debug pitch)
                  </summary>
                  <pre className="json-pre">{JSON.stringify({ detail, proof, releaseResult }, null, 2)}</pre>
                </details>
              </>
            )}
          </section>
        </main>
      )}

      <footer className="footer">
        <span>EscudoPay · Portal de Autoridades — Backend <code>{apiUrl("/api")}</code> · Stellar Testnet via <code>stellar.expert</code></span>
      </footer>
    </div>
  );
}
