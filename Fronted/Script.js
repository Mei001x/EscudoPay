/* =========================================================
   DATA SIMULADA — reemplazar por una llamada real a la API
   cuando tenga el backend conectado 
   
   ========================================================= */
const BUSCADOS = [
  {
    id: 1,
    alias: "Alias 'El Cóndor'",
    departamento: 'Lima',
    delito: 'Extorsión',
    descripcion: 'Cobro de cupo a comerciantes del Cercado de Lima.',
    recompensa: 'S/ 5,000',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Lima',
    delitoDetalle: 'Extorsión agravada en banda organizada',
  },
  {
    id: 2,
    alias: "Alias 'La Serpiente'",
    departamento: 'Arequipa',
    delito: 'Extorsión',
    descripcion: 'Amenazas a transportistas de la zona sur.',
    recompensa: 'S/ 3,000',
    estado: 'Prófugo',
    sexo: 'Femenino',
    lugarRQ: 'Arequipa',
    delitoDetalle: 'Extorsión con amenaza de daño físico',
  },
  {
    id: 3,
    alias: "Alias 'El Búho'",
    departamento: 'La Libertad',
    delito: 'Sicariato',
    descripcion: 'Vinculado a ataques armados por encargo.',
    recompensa: 'S/ 10,000',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Trujillo',
    delitoDetalle: 'Sicariato / organización criminal',
  },
  {
    id: 4,
    alias: "Alias 'Fantasma 23'",
    departamento: 'Lima',
    delito: 'Extorsión',
    descripcion: 'Cobro de cupo a negocios de construcción.',
    recompensa: 'S/ 4,500',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Lima Este',
    delitoDetalle: 'Extorsión agravada',
  },
  {
    id: 5,
    alias: "Alias 'El Toro'",
    departamento: 'Piura',
    delito: 'Cobro de cupo',
    descripcion: 'Exige pagos semanales a mototaxistas.',
    recompensa: 'S/ 2,500',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Piura',
    delitoDetalle: 'Extorsión / cobro de cupo',
  },
  {
    id: 6,
    alias: "Alias 'La Sombra'",
    departamento: 'Callao',
    delito: 'Extorsión',
    descripcion: 'Amenazas a comerciantes del mercado central.',
    recompensa: 'S/ 6,000',
    estado: 'Prófugo',
    sexo: 'Femenino',
    lugarRQ: 'Callao',
    delitoDetalle: 'Extorsión agravada en banda organizada',
  },
];

let currentTarget = null;
const uploaded = { images: [], audio: [], video: [] };

/* =========================================================
   NAVEGACIÓN ENTRE VISTAS
   ========================================================= */
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   RELOJ 
   ========================================================= */
function startClock(el) {
  if (!el) return;
  const tick = () => { el.textContent = new Date().toTimeString().slice(0, 8); };
  tick();
  setInterval(tick, 1000);
}
startClock(document.getElementById('clock'));
startClock(document.getElementById('clock2'));

/* =========================================================
   VISTA 1 → SELECCIÓN DE PERFIL
   ========================================================= */
document.getElementById('btnPnp').addEventListener('click', () => {
  showView('autoridades');
  initAutoridades();
});
document.getElementById('btnBackFromRestricted').addEventListener('click', () => showView('profile'));
const btnBackAutoridades = document.getElementById('btnBackFromAutoridades');
if (btnBackAutoridades) btnBackAutoridades.addEventListener('click', () => showView('profile'));
startClock(document.getElementById('clockAuth'));

/* ---- Tabs globales: [Denunciar] | [Verificación Autoridades] ---- */
function activateGlobalTab(target) {
  document.querySelectorAll('.global-tab').forEach((t) => {
    const on = t.dataset.target === target;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  if (target === 'autoridades') {
    showView('autoridades');
    initAutoridades();
  } else {
    renderFilters();
    renderGrid();
    showView('list');
  }
}
document.querySelectorAll('.global-tab').forEach((t) => {
  t.addEventListener('click', () => activateGlobalTab(t.dataset.target));
});

document.getElementById('btnInformante').addEventListener('click', () => {
  renderFilters();
  renderGrid();
  showView('list');
});

/* =========================================================
   VISTA 3 → LISTA DE BUSCADOS
   ========================================================= */
function uniqueValues(key) {
  return [...new Set(BUSCADOS.map((b) => b[key]))].sort();
}

function renderFilters() {
  const deptoSelect = document.getElementById('filterDepto');
  const delitoSelect = document.getElementById('filterDelito');
  if (deptoSelect.dataset.filled) return;

  uniqueValues('departamento').forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    deptoSelect.appendChild(opt);
  });
  uniqueValues('delito').forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    delitoSelect.appendChild(opt);
  });
  deptoSelect.dataset.filled = '1';
}

function renderGrid() {
  const grid = document.getElementById('wantedGrid');
  const empty = document.getElementById('emptyState');
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const depto = document.getElementById('filterDepto').value;
  const delito = document.getElementById('filterDelito').value;

  const filtrados = BUSCADOS.filter((b) => {
    const matchQ = !q || b.alias.toLowerCase().includes(q) || b.descripcion.toLowerCase().includes(q);
    const matchDepto = !depto || b.departamento === depto;
    const matchDelito = !delito || b.delito === delito;
    return matchQ && matchDepto && matchDelito;
  });

  grid.innerHTML = '';
  empty.style.display = filtrados.length ? 'none' : 'block';

  filtrados.forEach((b) => {
    const card = document.createElement('button');
    card.className = 'wanted-card';
    card.innerHTML = `
      <span class="wanted-tag">${b.departamento}</span>
      <span class="avatar-icon"><span class="head"></span><span class="body"></span></span>
      <div class="wanted-name">${b.alias}</div>
      <div class="wanted-desc">${b.descripcion}</div>
    `;
    card.addEventListener('click', () => openDetail(b.id));
    grid.appendChild(card);
  });
}

document.getElementById('searchInput').addEventListener('input', renderGrid);
document.getElementById('filterDepto').addEventListener('change', renderGrid);
document.getElementById('filterDelito').addEventListener('change', renderGrid);
document.getElementById('btnLogout').addEventListener('click', () => showView('profile'));

/* =========================================================
   VISTA 4 → DETALLE DEL BUSCADO
   ========================================================= */
function openDetail(id) {
  const b = BUSCADOS.find((x) => x.id === id);
  if (!b) return;
  currentTarget = b;

  document.getElementById('detailName').textContent = b.alias;
  document.getElementById('infoEstado').textContent = b.estado;
  document.getElementById('infoSexo').textContent = b.sexo;
  document.getElementById('infoLugar').textContent = b.lugarRQ;
  document.getElementById('infoDelito').textContent = b.delitoDetalle;
  document.getElementById('infoDesc').textContent = b.descripcion;
  document.getElementById('infoRecompensa').textContent = b.recompensa;

  showView('detail');
}

document.getElementById('btnBackToList').addEventListener('click', () => showView('list'));

/* =========================================================
   VISTA 5 → FORMULARIO DE REPORTE
   ========================================================= */
document.getElementById('btnReport').addEventListener('click', () => {
  document.getElementById('reportTargetTag').textContent = currentTarget ? currentTarget.alias : '—';
  resetReportForm();
  showView('report');
});
document.getElementById('btnBackFromReport').addEventListener('click', () => showView('detail'));

const reportText = document.getElementById('reportText');
const charCount = document.getElementById('charCount');
reportText.addEventListener('input', () => { charCount.textContent = reportText.value.length; });

function wireUpload(boxId, inputId, countId, bucket) {
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);
  const countEl = document.getElementById(countId);
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    uploaded[bucket] = Array.from(input.files);
    countEl.textContent = uploaded[bucket].length ? `${uploaded[bucket].length} archivo(s)` : '';
  });
}
wireUpload('uploadImages', 'fileImages', 'countImages', 'images');
wireUpload('uploadAudio', 'fileAudio', 'countAudio', 'audio');
wireUpload('uploadVideo', 'fileVideo', 'countVideo', 'video');

function resetReportForm() {
  reportText.value = '';
  charCount.textContent = '0';
  ['images', 'audio', 'video'].forEach((k) => { uploaded[k] = []; });
  document.getElementById('countImages').textContent = '';
  document.getElementById('countAudio').textContent = '';
  document.getElementById('countVideo').textContent = '';
  document.getElementById('uploadProgress').classList.remove('show');
  document.getElementById('progressFill').style.transform = 'scaleX(0)';
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('btnSubmitReport').disabled = false;
  document.getElementById('btnSubmitReport').textContent = 'Subir información (todo)';
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

document.getElementById('btnSubmitReport').addEventListener('click', async () => {
  if (!reportText.value.trim() && !uploaded.images.length && !uploaded.audio.length && !uploaded.video.length) {
    reportText.focus();
    return;
  }

  const btn = document.getElementById('btnSubmitReport');
  const wrap = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');
  const pct = document.getElementById('progressPct');

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  wrap.classList.add('show');

  /*
   * TODO backend: aquí es donde se arma el FormData real y se hace el
   * POST a tu endpoint, algo como:
   *
   * const form = new FormData();
   * form.append('texto', reportText.value);
   * form.append('buscadoId', currentTarget.id);
   * uploaded.images.forEach(f => form.append('imagenes', f));
   * uploaded.audio.forEach(f => form.append('audios', f));
   * uploaded.video.forEach(f => form.append('videos', f));
   * await fetch('/api/reportes', { method: 'POST', body: form });
   *
   * Por ahora se simula el progreso para la demo.
   */
  const pasos = [0.3, 0.65, 1];
  for (const p of pasos) {
    fill.style.transform = 'scaleX(' + p + ')';
    pct.textContent = Math.round(p * 100) + '%';
    await wait(600);
  }
  await wait(400);

  showView('thanks');
});

document.getElementById('btnBackToListFromThanks').addEventListener('click', () => {
  renderGrid();
  showView('list');
});

/* =========================================================
   PORTAL DE AUTORIDADES / ESCUDOPAY ADMIN
   ========================================================= */
const API_BASE = "http://localhost:4000";
// Wallet REAL de Testnet (StrKey válido + fondeada vía friendbot).
// Debe ser una public key Ed25519 con checksum correcto: si no,
// Operation.payment falla con "destination is invalid".
const DEMO_INFORMANTE_WALLET = "GAUP7AU33PW2KGEHAX2LCU7FTRTJVUXZ2U7F7X5QJFYXNSBRJ63HZPPV";
let authCases = [];
let selectedAuthCaseId = null;

function apiUrl(path) { return `${API_BASE}${path}`; }

function statusLabelAuth(s) {
  const m = {
    recibido: "RECIBIDO",
    en_verificacion: "EN REVISIÓN",
    en_revision: "EN REVISIÓN",
    listo_para_liberar: "LISTO PARA LIBERAR",
    pagado: "PAGADO",
    rechazado: "RECHAZADO",
    en_cola: "EN COLA",
  };
  const k = String(s || "").toLowerCase();
  return m[k] || String(s || "").toUpperCase();
}
// Tono del badge: fondo 8%, borde 20%, texto saturado (ver Style.css).
function statusToneAuth(s) {
  const k = String(s).toLowerCase();
  if (k === "pagado") return "tone-pagado";
  if (k === "listo_para_liberar") return "tone-listo";
  if (k === "en_verificacion" || k === "en_revision" || k === "en_verificacíon") return "tone-revision";
  if (k === "recibido") return "tone-recibido";
  if (k === "rechazado") return "tone-rechazado";
  return "tone-default";
}
function statusColorAuth(s) {
  const k = String(s || "").toLowerCase();
  if (k === "pagado") return "#4ade80";
  if (k === "listo_para_liberar") return "#facc15";
  if (k === "en_verificacion" || k === "en_revision") return "#38bdf8";
  if (k === "recibido") return "#2dd9c4";
  if (k === "rechazado") return "#fb7185";
  return "#8fb8b3";
}
function showAuthToast(msg, type = "info") {
  const el = document.getElementById("authToast");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.style.background = type === "ok" ? "#4ade80" : type === "err" ? "rgba(251,113,133,0.12)" : "var(--panel)";
  el.style.color = type === "ok" ? "#04211d" : type === "err" ? "#fecdd3" : "var(--text)";
  el.style.border = `1px solid ${type === "ok" ? "var(--green-dim)" : type === "err" ? "var(--red-dim)" : "var(--line)"}`;
  setTimeout(() => { el.style.display = "none"; }, 4000);
}

async function fetchAuthCases() {
  const listEl = document.getElementById("authCasesList");
  const emptyEl = document.getElementById("authCasesEmpty");
  const countEl = document.getElementById("authCasesCount");
  try {
    const r = await fetch(apiUrl("/api/cases"), { headers: { "Content-Type": "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    authCases = data.casos || data.cases || [];
    if (countEl) countEl.textContent = `${authCases.length} caso${authCases.length !== 1 ? "s" : ""}`;
    if (!authCases.length) {
      if (listEl) listEl.innerHTML = "";
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    renderAuthCases();
  } catch (e) {
    showAuthToast("Error cargando casos: " + e.message, "err");
    if (listEl) listEl.innerHTML = `<div class="empty-state" style="color:var(--red);">${e.message} — ¿Backend en http://localhost:4000?</div>`;
  }
}
function renderAuthCases() {
  const listEl = document.getElementById("authCasesList");
  if (!listEl) return;
  listEl.innerHTML = "";
  authCases.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = `auth-case-row ${selectedAuthCaseId === c.caseId ? "selected" : ""}`;
    btn.innerHTML = `
      <div class="auth-case-top">
        <span class="auth-case-id" title="${c.caseId}">${c.caseId.slice(0,8)}…${c.caseId.slice(-4)}</span>
        <span style="display:flex;gap:6px;align-items:center;">
          ${c.pagoSimulado ? `<span class="wanted-tag is-sim" title="El pago NO fue on-chain">Simulado</span>` : ""}
          <span class="wanted-tag ${statusToneAuth(c.status)}">${statusLabelAuth(c.status)}</span>
        </span>
      </div>
      <div class="auth-case-meta">
        <span>Delito: <b>${c.delitoTipo}</b></span>
        <span>Monto: <b>${c.montoRecompensa} XLM</b></span>
      </div>
      <div class="auth-case-foot">${c.caseId}</div>
      <div class="auth-case-foot">${new Date(c.createdAt).toLocaleString("es-PE")}</div>
    `;
    btn.addEventListener("click", () => {
      selectedAuthCaseId = c.caseId;
      const input = document.getElementById("inputCaseId");
      if (input) input.value = c.caseId;
      loadAuthDetail(c.caseId);
      renderAuthCases();
    });
    listEl.appendChild(btn);
  });
}

async function loadAuthDetail(caseId) {
  const noSel = document.getElementById("authNoSelection");
  const detailWrap = document.getElementById("authDetail");
  const paySuccess = document.getElementById("authPaySuccess");
  if (paySuccess) paySuccess.style.display = "none";
  try {
    const [r1, r2] = await Promise.all([
      fetch(apiUrl(`/api/cases/${caseId}`), { headers: { "Content-Type": "application/json" } }),
      fetch(apiUrl(`/api/cases/${caseId}/proof`), { headers: { "Content-Type": "application/json" } }),
    ]);
    if (!r1.ok) {
      const j = await r1.json().catch(() => ({}));
      throw new Error(j.error || `Caso no encontrado (${r1.status})`);
    }
    const d = await r1.json();
    let proof = null;
    if (r2.ok) proof = await r2.json();

    selectedAuthCaseId = caseId;
    renderAuthCases();
    if (noSel) noSel.style.display = "none";
    if (detailWrap) detailWrap.style.display = "block";

    document.getElementById("authDetailId").textContent = d.caseId;
    const st = document.getElementById("authDetailStatus");
    st.textContent = statusLabelAuth(d.status);
    st.className = `wanted-tag ${statusToneAuth(d.status)}`;
    document.getElementById("authDelito").textContent = d.delitoTipo;
    document.getElementById("authEstado").textContent = statusLabelAuth(d.status);
    document.getElementById("authRecompensa").textContent = `${d.montoRecompensa} XLM`;
    document.getElementById("authFirmas").textContent = `${d.firmas.obtenidas} / ${d.firmas.requeridas}`;
    document.getElementById("authCreado").textContent = new Date(d.createdAt).toLocaleString("es-PE");

    const link = document.getElementById("authExplorerLink");
    const none = document.getElementById("authExplorerNone");
    const txEl = document.getElementById("authTxHash");
    const explorerUrl = proof?.explorerLinks?.evidencia || (d.evidenciaAncladaTx ? `https://stellar.expert/explorer/testnet/tx/${d.evidenciaAncladaTx}` : null);
    if (explorerUrl) {
      link.href = explorerUrl;
      link.style.display = "inline-block";
      if (none) none.style.display = "none";
    } else {
      link.style.display = "none";
      if (none) none.style.display = "block";
    }
    txEl.textContent = d.evidenciaAncladaTx ? `tx: ${d.evidenciaAncladaTx}` : "";

    // habilitar/deshabilitar Liberar
    const canRelease = String(d.status).toLowerCase() === "listo_para_liberar";
    const btnRelease = document.getElementById("btnRelease");
    btnRelease.disabled = !canRelease;
    document.getElementById("authReleaseHint").style.display = canRelease ? "none" : "block";

    // si ya está pagado, mostrar éxito
    if (String(d.status).toLowerCase() === "pagado" && d.releaseTx) {
      const payTx = document.getElementById("authPayTx");
      const payLink = document.getElementById("authPayExplorer");
      if (paySuccess) paySuccess.style.display = "block";
      payTx.textContent = `tx: ${d.releaseTx}`;
      payLink.href = `https://stellar.expert/explorer/testnet/tx/${d.releaseTx}`;
      if (paySuccess) {
        const icon = paySuccess.querySelector("div:first-child");
        const titulo = paySuccess.querySelector("div:nth-child(2)");
        if (d.pagoSimulado) {
          // El hash NO existe on-chain — nunca debe leerse como un pago real.
          paySuccess.classList.add("is-simulado");
          if (icon) icon.innerHTML = `' + ICON_ALERT + '`;
          if (titulo) {
            titulo.textContent = "Pago simulado — este hash no existe on-chain. La transacción real falló y no se transfirió XLM al informante.";
          }
        } else {
          paySuccess.classList.remove("is-simulado");
          if (icon) icon.innerHTML = `' + ICON_CHECK + '`;
          if (titulo) titulo.textContent = "Caso ya pagado";
        }
      }
    }
  } catch (e) {
    showAuthToast(e.message, "err");
  }
}

async function verifyAuth(rol) {
  if (!selectedAuthCaseId) return showAuthToast("Selecciona un caso primero", "err");
  const payload = rol === "policia"
    ? { rol: "policia", verificadorId: "PNP-DIRNIC-04821", verificadorWallet: DEMO_INFORMANTE_WALLET, resultado: "APROBADO" }
    : { rol: "fiscalia", verificadorId: "MP-FISC-99120", verificadorWallet: DEMO_INFORMANTE_WALLET, resultado: "APROBADO" };
  try {
    const r = await fetch(apiUrl(`/api/cases/${selectedAuthCaseId}/verify`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    showAuthToast(`${rol === "policia" ? "PNP" : "Fiscalía"} aprobó. Estado: ${statusLabelAuth(j.status)}`, "ok");
    await fetchAuthCases();
    await loadAuthDetail(selectedAuthCaseId);
  } catch (e) {
    if (String(e.message).includes("ya firmó")) showAuthToast("Este rol ya firmó este caso", "err");
    else showAuthToast(e.message, "err");
  }
}

async function releaseAuth() {
  if (!selectedAuthCaseId) return showAuthToast("Selecciona un caso", "err");
  try {
    const r = await fetch(apiUrl(`/api/cases/${selectedAuthCaseId}/release`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: 50 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    // mostrar destacado
    const paySuccess = document.getElementById("authPaySuccess");
    const payTx = document.getElementById("authPayTx");
    const payLink = document.getElementById("authPayExplorer");
    if (paySuccess) paySuccess.style.display = "block";
    const titulo = paySuccess.querySelector("div:nth-child(2)");
    const icon = paySuccess.querySelector(".pay-icon");
    if (j.simulado) {
      paySuccess.classList.add("is-simulado");
      if (icon) icon.innerHTML = `' + ICON_ALERT + '`;
      titulo.textContent = "Pago simulado — la tx on-chain falló";
      showAuthToast("Pago simulado (la tx on-chain falló)", "err");
    } else {
      paySuccess.classList.remove("is-simulado");
      if (icon) icon.innerHTML = `' + ICON_CHECK + '`;
      titulo.textContent = "Pago de 50 XLM transferido con éxito";
      showAuthToast("Pago de 50 XLM transferido con éxito", "ok");
    }
    payTx.textContent = `tx: ${j.tx}`;
    payLink.href = j.explorerUrl;
    payLink.innerHTML = `' + ICON_OUT + ' Ver en Stellar Expert`;
    await fetchAuthCases();
    await loadAuthDetail(selectedAuthCaseId);
  } catch (e) {
    showAuthToast(e.message, "err");
  }
}

async function createDemoCase() {
  try {
    const r = await fetch(apiUrl("/api/reports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        informanteWallet: DEMO_INFORMANTE_WALLET,
        delitoTipo: "EXTORSION",
        descripcion: "Reporte demo para pitch — EscudoPay Admin",
        evidenciaHash: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        montoRecompensaSugerido: 50,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "No se pudo crear caso demo");
    showAuthToast(`Caso demo creado: ${j.caseId}`, "ok");
    const input = document.getElementById("inputCaseId");
    if (input) input.value = j.caseId;
    await fetchAuthCases();
    selectedAuthCaseId = j.caseId;
    await loadAuthDetail(j.caseId);
  } catch (e) {
    showAuthToast(e.message, "err");
  }
}

function initAutoridades() {
  fetchAuthCases();
  const input = document.getElementById("inputCaseId");
  const btnLoad = document.getElementById("btnLoadCase");
  const btnRefresh = document.getElementById("btnRefreshCases");
  const btnDemo = document.getElementById("btnCreateDemo");
  const btnPnp = document.getElementById("btnVerifyPnp");
  const btnFis = document.getElementById("btnVerifyFiscalia");
  const btnRel = document.getElementById("btnRelease");
  if (btnLoad && !btnLoad.dataset.wired) {
    btnLoad.dataset.wired = "1";
    btnLoad.addEventListener("click", () => {
      const v = input.value.trim();
      if (!v) return showAuthToast("Pega un caseId válido", "err");
      loadAuthDetail(v);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") btnLoad.click(); });
    btnRefresh.addEventListener("click", fetchAuthCases);
    btnDemo.addEventListener("click", createDemoCase);
    btnPnp.addEventListener("click", () => verifyAuth("policia"));
    btnFis.addEventListener("click", () => verifyAuth("fiscalia"));
    btnRel.addEventListener("click", releaseAuth);
  }
}

/* Vista inicial — arranca directo en el panel de autoridades (pitch) */
activateGlobalTab('autoridades');