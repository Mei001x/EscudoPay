import { useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";
const apiUrl = (p: string) => (API_BASE ? `${API_BASE.replace(/\/$/, "")}${p}` : p);

// Wallet REAL de Testnet, StrKey válido y fondeada vía friendbot.
// Si el destino no es una public key Ed25519 con checksum correcto,
// Operation.payment falla en Stellar con "destination is invalid".
const DEMO_INFORMANTE_WALLET =
  "GAUP7AU33PW2KGEHAX2LCU7FTRTJVUXZ2U7F7X5QJFYXNSBRJ63HZPPV";

type ReportResult = { caseId: string; explorerUrl: string; tx: string };

// ── Validación StrKey ────────────────────────────────────────────
// La wallet es lo único que separa "cobro mi recompensa" de "la
// pierden en silencio". El backend no valida el destino al recibir la
// denuncia: acepta cualquier texto y falla mucho después, en el
// momento del pago, cuando ya no hay nadie a quien preguntarle.
//
// Se reimplementa el chequeo de Stellar aquí (base32 + CRC16-XModem
// sobre el version byte 0x30 de Ed25519) en vez de consultar Horizon,
// porque un round-trip por pulsación de teclado es latencia de sobra
// para un campo que se rellena pegando un solo bloque de texto.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STRKEY_ED25519_VERSION = 6 << 3; // 0x30 → prefijo "G"

function base32Decode(s: string): number[] {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("carácter fuera del alfabeto base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return out;
}

function crc16xmodem(bytes: number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function esPublicKeyValida(addr: string): boolean {
  if (!/^G[A-Z0-9]{55}$/.test(addr)) return false;
  try {
    const raw = base32Decode(addr);
    if (raw.length !== 35) return false;
    const esperado = crc16xmodem(raw.slice(0, 33));
    return raw[0] === STRKEY_ED25519_VERSION && esperado === (raw[33] | (raw[34] << 8));
  } catch {
    return false;
  }
}

// Iconografía en SVG dibujado, un trazo y un grosor. Sin glyphs Unicode:
// los emojis se renderizan distinto en cada SO y rompían el ritmo visual.
function ShieldCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4.5 6v5.5c0 4.4 3 8.1 7.5 9.5 4.5-1.4 7.5-5.1 7.5-9.5V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}
function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}
function Lock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
function Alert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
function External() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="m19 5-8 8" />
      <path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10" />
    </svg>
  );
}
function Send() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12 20 4.5 15.5 20l-3.4-5.9z" />
      <path d="m12.1 14.1 7.9-9.6" />
    </svg>
  );
}
function Copy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  );
}
function CircleCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"denunciar" | "autoridades">("denunciar");
  const [form, setForm] = useState({
    delitoTipo: "EXTORSION",
    descripcion: "",
    monto: "50",
    wallet: DEMO_INFORMANTE_WALLET,
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const walletValida = esPublicKeyValida(form.wallet);
  // Sólo invalidamos si el usuario ya escribió algo: un campo vacío no
  // es un error, es un campo sin llenar.
  const walletTocada = form.wallet.trim().length > 0;
  const walletMala = walletTocada && !walletValida;

  // Cuando la validación local rechaza el envío, el foco va al campo
  // culpable. Decir "la wallet no es válida" sin señalar cuál de los
  // dos campos es deja al usuario adivinando, y el mensaje aparece a
  // 250px del botón, fuera de la vista.
  const descRef = useRef<HTMLTextAreaElement>(null);
  const walletRef = useRef<HTMLInputElement>(null);

  const copiarWallet = async () => {
    try {
      await navigator.clipboard.writeText(form.wallet);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const submit = async () => {
    if (!form.descripcion.trim()) {
      setError("Falta la descripción. Escribe qué viste, dónde y con quién; sin eso nadie puede verificar el caso.");
      descRef.current?.focus();
      return;
    }
    // No bloqueamos con un modal ni con un diálogo: el error ya dice
    // qué hacer, y la wallet ya señala el problema en rojo arriba.
    if (!walletValida) {
      setError("La wallet no es una clave pública válida. Sin una dirección correcta la recompensa no podrá enviarse.");
      walletRef.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          informanteWallet: form.wallet,
          delitoTipo: form.delitoTipo,
          descripcion: form.descripcion,
          montoRecompensaSugerido: Number(form.monto) || 50,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setResult({ caseId: j.caseId, explorerUrl: j.explorerUrl, tx: j.evidenciaAncladaTx });
      setForm((f) => ({ ...f, descripcion: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const confirmacion = result && (
    <div className="confirm-card">
      <div className="confirm-icon">
        <Check />
      </div>
      <div className="confirm-title">Denuncia registrada</div>
      <p className="confirm-sub">
        La evidencia quedó anclada en Stellar Testnet. Las autoridades revisan el caso y, si lo aprueban,
        el pago se libera a tu wallet.
      </p>
      <div className="case-receipt">
        <div className="case-receipt-label">Identificador del caso</div>
        <div className="case-receipt-value">{result.caseId}</div>
      </div>
      <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="btn-explorer">
        Ver evidencia en Stellar Expert <External />
      </a>
      <p className="hint">Guarda este identificador para seguir el caso.</p>
    </div>
  );

  return (
    <div className="citizen-root">
      <div className="topstack">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">EscudoPay</span>
            <span className="brand-sub">Portal ciudadano</span>
          </div>
          <nav className="tabs">
            <button
              className={activeTab === "denunciar" ? "tab active" : "tab"}
              onClick={() => setActiveTab("denunciar")}
            >
              <ReportIcon /> Denunciar
            </button>
            <button
              className={activeTab === "autoridades" ? "tab active" : "tab"}
              onClick={() => setActiveTab("autoridades")}
            >
              <ShieldCheck /> Verificación de autoridades
            </button>
          </nav>
          <div className="header-actions">
            <span className="live-dot">
              <span className="dot" /> Testnet
            </span>
          </div>
        </header>
      </div>

      {activeTab === "autoridades" ? (
        <main className="citizen-wrap">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <ShieldCheck /> Verificación de autoridades
              </h2>
              <p className="panel-sub">
                La Policía Nacional y el Ministerio Público auditan cada caso por separado. Ninguno
                de los dos puede cobrar por sí solo.
              </p>
            </div>
            <ul className="steps">
              <li><span className="step-dot" /><span><b>Revisión.</b> Las autoridades leen tu denuncia y la contrastan.</span></li>
              <li><span className="step-dot" /><span><b>Doble firma.</b> PNP y Fiscalía firman por separado; hacen falta las dos.</span></li>
              <li><span className="step-dot" /><span><b>Liberación.</b> Con el quorum completo, la recompensa viaja a tu wallet.</span></li>
            </ul>
            <div className="post-send">
              <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
                El panel donde se firman y se pagan los casos corre en su propio portal de
                autoridades. Esta pantalla es sólo informativa.
              </p>
            </div>
          </section>
        </main>
      ) : (
        <main className="citizen-wrap">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Enviar denuncia anónima</h2>
              <p className="panel-sub">
                No pedimos nombre, documento ni teléfono. Cuéntanos sólo lo que viste.
              </p>
            </div>

            <div className="privacy-note">
              <Lock />
              <p>
                <b>No podemos identificarte.</b> Lo único que sale de aquí es la descripción y la
                wallet donde cobras, que no es un dato tuyo.
              </p>
            </div>

            {result && (
              <div style={{ marginBottom: 24 }}>{confirmacion}</div>
            )}

            <label className="field">
              <span className="field-label">Tipo de delito</span>
              <select
                className="input"
                value={form.delitoTipo}
                onChange={(e) => setForm({ ...form, delitoTipo: e.target.value })}
              >
                <option value="EXTORSION">Extorsión</option>
                <option value="SICARIATO">Sicariato</option>
              </select>
            </label>

            <label className="field lead-field">
              <span className="field-label">Cuéntanos qué sabes</span>
              <textarea
                ref={descRef}
                className="input textarea"
                rows={9}
                placeholder="Dónde lo viste, con quién anda, cómo se moviliza, a qué hora. Cualquier dato concreto sirve."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
              <span className="field-hint">
                Mientras más concreto, más fácil será verificarlo. Una dirección, una placa o una
                hora bastan.
              </span>
            </label>

            <div className={`wallet-block${walletMala ? " es-invalida" : ""}`}>
              <div className="wallet-head">
                <span className="field-label">Wallet para recibir el pago</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={copiarWallet}
                  disabled={!form.wallet}
                  aria-label="Copiar la wallet"
                >
                  <Copy />
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
              <div className="wallet-input-row">
                <input
                  ref={walletRef}
                  className="input mono-input"
                  value={form.wallet}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    setForm({ ...form, wallet: e.target.value.trim() });
                    if (error) setError(null);
                  }}
                />
              </div>
              {walletValida ? (
                <div className="wallet-status ok">
                  <CircleCheck />
                  <span>Clave pública válida. La recompensa podrá enviarse a esta dirección.</span>
                </div>
              ) : walletMala ? (
                <div className="wallet-status mal">
                  <Alert />
                  <span>
                    No es una clave pública de Stellar válida. Revisa que sea una dirección que
                    empiece por G y tenga 56 caracteres; si no, nadie podrá cobrar el caso.
                  </span>
                </div>
              ) : (
                <div className="wallet-status">
                  <Lock />
                  <span>Es la única forma de cobrar: no guardamos tu clave privada, sólo esta dirección.</span>
                </div>
              )}
            </div>

            <div className="compact-row" style={{ marginBottom: 22 }}>
              <label className="field reward-field">
                <span className="field-label">Recompensa sugerida</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
                <span className="field-hint">XLM · las autoridades pueden ajustarla.</span>
              </label>
            </div>

            <div className="commit-bar">
              {error && (
                <div className="alert-err">
                  <Alert />
                  <span>{error}</span>
                </div>
              )}
              <div className="commit-note">
                <Lock />
                <span>
                  Enviar hace pública la evidencia y su anclaje en Stellar. Tu identidad no forma
                  parte de lo que se publica.
                </span>
              </div>
              <button className="btn-primary" onClick={submit} disabled={sending}>
                <Send />
                {sending ? "Anclando evidencia en Stellar…" : "Enviar denuncia anónima"}
              </button>
            </div>

            <div className="post-send">
              <div className="post-send-title">Qué pasa después</div>
              <ul className="steps">
                <li><span className="step-dot" /><span>Las autoridades revisan el caso y firman por separado.</span></li>
                <li><span className="step-dot" /><span>Con las dos firmas, la recompensa se libera a tu wallet.</span></li>
              </ul>
            </div>
          </section>
        </main>
      )}

      <footer className="footer">
        <span>EscudoPay · Portal ciudadano</span>
        <span>
          Red <code>Testnet</code> · Evidencia en <code>stellar.expert</code>
        </span>
      </footer>
    </div>
  );
}
