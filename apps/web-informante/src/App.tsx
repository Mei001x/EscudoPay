import { useState } from "react";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";
const apiUrl = (p: string) => (API_BASE ? `${API_BASE.replace(/\/$/, "")}${p}` : p);

// Wallet REAL de Testnet, StrKey válido y fondeada vía friendbot.
// Si el destino no es una public key Ed25519 con checksum correcto,
// Operation.payment falla en Stellar con "destination is invalid".
const DEMO_INFORMANTE_WALLET =
  "GAUP7AU33PW2KGEHAX2LCU7FTRTJVUXZ2U7F7X5QJFYXNSBRJ63HZPPV";

type ReportResult = { caseId: string; explorerUrl: string; tx: string };

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

  const submit = async () => {
    if (!form.descripcion.trim()) {
      setError("Escribe el detalle de la denuncia");
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

  return (
    <div className="citizen-root">
      <header className="topbar">
        <div className="brand">
          <span className="brand-shield">🛡️</span>
          <span className="brand-name">EscudoPay</span>
          <span className="brand-sub">CIUDADANO</span>
        </div>
        <nav className="tabs">
          <button
            className={activeTab === "denunciar" ? "tab active" : "tab"}
            onClick={() => setActiveTab("denunciar")}
          >
            📱 Denunciar
          </button>
          <button
            className={activeTab === "autoridades" ? "tab active" : "tab"}
            onClick={() => setActiveTab("autoridades")}
          >
            🛡️ Verificación Autoridades
          </button>
        </nav>
        <div className="header-actions">
          <span className="live-dot">
            <span className="dot" /> CANAL SEGURO
          </span>
        </div>
      </header>

      {activeTab === "autoridades" ? (
        <main className="citizen-wrap">
          <section className="panel">
            <div className="panel-corners" />
            <h2 className="panel-title" style={{ marginBottom: 10 }}>
              🛡️ Portal de Verificación y Auditoría
            </h2>
            <p style={{ color: "var(--text-mid)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              El panel donde la PNP y el Ministerio Público auditan los casos, firman las verificaciones
              y liberan la recompensa on-chain en Stellar Testnet.
            </p>
            <ul className="steps">
              <li><b>Sección 1</b> — Listado de casos pendientes desde <code>GET /api/cases</code></li>
              <li><b>Sección 2</b> — <i>Aprobar PNP</i> · <i>Aprobar Fiscalía</i> · <i>Liberar 50 XLM</i></li>
              <li>Input manual de <code>caseId</code> para auditar un caso al instante</li>
            </ul>
            <a className="btn-primary link-btn" href="http://localhost:5174" target="_blank" rel="noreferrer">
              Abrir Portal de Autoridades →
            </a>
            <p className="hint">Corre en {apiUrl("/api") || "el backend local"} · Stellar Testnet</p>
          </section>

          <section className="panel">
            <div className="panel-corners" />
            <h2 className="panel-title">¿Ya reportaste algo?</h2>
            <p style={{ color: "var(--text-mid)", fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
              Pega aquí el <code>caseId</code> que te devolvió el backend para copiarlo rápido
              y pasarlo al panel de autoridades.
            </p>
            {result && (
              <div className="pay-success" style={{ marginTop: 14 }}>
                <div className="pay-icon">✓</div>
                <div className="pay-title">Denuncia registrada</div>
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-mid)", wordBreak: "break-all" }}>
                  caseId: <b style={{ color: "var(--teal)" }}>{result.caseId}</b>
                </div>
                <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="btn-explorer">
                  Ver evidencia en Stellar Expert ↗
                </a>
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="citizen-wrap">
          <section className="panel">
            <div className="panel-corners" />
            <div className="panel-head">
              <div>
                <h2 className="panel-title">📱 Reportar información (anónimo)</h2>
                <p className="panel-sub">
                  POST <code>/api/reports</code> · La evidencia se ancla en Stellar automáticamente
                </p>
              </div>
            </div>

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

            <label className="field">
              <span className="field-label">Cuéntanos qué sabes</span>
              <textarea
                className="input textarea"
                rows={6}
                placeholder="Dónde lo viste, con quién anda, cómo se moviliza, cualquier dato útil. Tu identidad nunca se comparte."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Recompensa sugerida (XLM)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                />
              </label>
              <label className="field grow">
                <span className="field-label">Wallet del informante (recibirá el pago)</span>
                <input
                  className="input"
                  value={form.wallet}
                  spellCheck={false}
                  onChange={(e) => setForm({ ...form, wallet: e.target.value })}
                />
              </label>
            </div>

            {error && <div className="alert-err">⚠ {error}</div>}

            <button className="btn-primary" style={{ marginTop: 18 }} onClick={submit} disabled={sending}>
              {sending ? "Anclando evidencia en Stellar…" : "Enviar denuncia anónima"}
            </button>
            <p className="hint">Todo lo que envíes queda cifrado y no se vincula a tu identidad.</p>
          </section>

          <section className="panel">
            <div className="panel-corners" />
            <h2 className="panel-title">Resultado</h2>
            {!result ? (
              <div className="empty">
                <div style={{ fontSize: 26 }}>🛰️</div>
                <p style={{ color: "var(--text-mid)", fontSize: 12, maxWidth: "44ch", margin: "0 auto" }}>
                  Aún no has enviado ninguna denuncia. Cuando la envíes verás aquí el <b>caseId</b> y el
                  enlace a la evidencia anclada en Stellar Expert.
                </p>
              </div>
            ) : (
              <div className="pay-success">
                <div className="pay-icon">✓</div>
                <div className="pay-title">¡Gracias por tu compromiso!</div>
                <p style={{ color: "var(--text-mid)", fontSize: 12, margin: "10px 0 0" }}>
                  Tu denuncia quedó registrada y la evidencia está anclada on-chain.
                </p>
                <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-mid)", wordBreak: "break-all" }}>
                  caseId: <b style={{ color: "var(--teal)" }}>{result.caseId}</b>
                </div>
                <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="btn-explorer">
                  Ver evidencia en Stellar Expert ↗
                </a>
              </div>
            )}
          </section>
        </main>
      )}

      <footer className="footer">
        <span>
          EscudoPay · Portal Ciudadano — Backend <code>{apiUrl("/api") || "local"}</code> · Stellar Testnet
          via <code>stellar.expert</code>
        </span>
      </footer>
    </div>
  );
}
